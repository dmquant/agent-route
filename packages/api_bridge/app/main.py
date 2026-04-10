import os
import json
import uuid
import asyncio
from typing import Optional
from dotenv import load_dotenv

# Boot Environment Configurations BEFORE importing modules that depend on env vars
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), '.env')
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import websockets
import httpx

# Legacy executor.py and history.py removed — all execution flows through Hand protocol
# and SessionEventManager now. Historical logs migrated to session events.
from app.agent_registry import get_all_agents, discover_skills
from app.report_engine import get_daily_stats, build_report_prompt
from app.hands.registry import hand_registry, auto_register_all
from app.session.manager import session_events, init_event_tables
from app.session.events import EventType
from app.brain.orchestrator import orchestrator
from app.brain.harness import harness_manager
from app.sandbox.pool import sandbox_pool, init_sandbox_tables
from app.tasks import task_manager, TaskPhase, init_task_tables, get_task_history
from app.session_store import (
    init_session_db,
    create_project, list_projects, update_project, delete_project,
    create_session, list_sessions, get_session, update_session, delete_session,
    add_message, get_messages, get_messages_with_images, auto_title_session,
    get_session_workspace,
)

app = FastAPI(title="AI Execution Bridge API", description="Pydantic structured REST & WS gateway for Agent CLIs.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExecutionRequest(BaseModel):
    client: str
    prompt: str
    workspace_id: Optional[str] = None
    node_id: Optional[str] = "api_request"
    role: Optional[str] = "system"
    model: Optional[str] = None

class ExecutionResponse(BaseModel):
    exitCode: Optional[int]
    output: str

# ─── Pydantic models for session/project API ────────────────

class ProjectCreate(BaseModel):
    name: str
    description: str = ''
    color: str = '#6366f1'

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None

class SessionCreate(BaseModel):
    project_id: Optional[str] = None
    title: str = 'New Session'
    agent_type: str = 'gemini'

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None


# ---------------------------------------------
# 1. Native Model Discovery & Configuration
# ---------------------------------------------
@app.on_event("startup")
async def startup_event():
    init_session_db()
    init_event_tables()
    init_sandbox_tables()
    init_task_tables()
    # Register all execution hands (Managed Agents Phase 1)
    auto_register_all()
    print(f"[Startup] Hand Registry: {hand_registry.list_names()}")
    # Start periodic GC for completed tasks
    await task_manager.start_gc_loop(interval_seconds=60, max_age_ms=300000)

@app.on_event("shutdown")
async def shutdown_event():
    """Graceful shutdown: cancel running tasks and persist final state."""
    task_manager.stop_gc_loop()
    await task_manager.shutdown()

@app.get("/api/logs")
def api_get_logs():
    """Legacy log endpoint — returns recent session events instead."""
    recent = session_events.get_recent_events(limit=100)
    return {"logs": recent}

@app.get("/models/ollama")
async def get_ollama_models():
    """Queries localhost:11434 for locally installed models"""
    if os.getenv("ENABLE_OLLAMA_API") != "true":
        return {"models": []}
        
    try:
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{ollama_url}/api/tags", timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                return {"models": [m["name"] for m in data.get("models", [])]}
    except Exception as e:
         print(f"Ollama discovery failed: {e}")
         return {"models": []}


# ---------------------------------------------
# 2. PROJECT & SESSION CRUD API
# ---------------------------------------------

@app.get("/api/projects")
def api_list_projects():
    return {"projects": list_projects()}

@app.post("/api/projects")
def api_create_project(body: ProjectCreate):
    project = create_project(name=body.name, description=body.description, color=body.color)
    return {"project": project}

@app.put("/api/projects/{project_id}")
def api_update_project(project_id: str, body: ProjectUpdate):
    project = update_project(project_id, name=body.name, description=body.description, color=body.color)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project": project}

@app.delete("/api/projects/{project_id}")
def api_delete_project(project_id: str):
    delete_project(project_id)
    return {"ok": True}

@app.get("/api/sessions")
def api_list_sessions(project_id: Optional[str] = None):
    return {"sessions": list_sessions(project_id=project_id)}

@app.post("/api/sessions")
def api_create_session(body: SessionCreate):
    session = create_session(project_id=body.project_id, title=body.title, agent_type=body.agent_type)
    return {"session": session}

@app.get("/api/sessions/{session_id}")
def api_get_session(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": session}

@app.put("/api/sessions/{session_id}")
def api_update_session(session_id: str, body: SessionUpdate):
    # Handle special sentinel for project_id removal
    proj_id = '__UNSET__'
    if body.project_id is not None:
        proj_id = body.project_id if body.project_id != '' else None
    session = update_session(session_id, title=body.title, project_id=proj_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": session}

@app.delete("/api/sessions/{session_id}")
def api_delete_session(session_id: str):
    delete_session(session_id)
    return {"ok": True}

@app.get("/api/sessions/{session_id}/messages")
def api_get_messages(session_id: str, include_images: bool = False):
    if include_images:
        msgs = get_messages_with_images(session_id)
    else:
        msgs = get_messages(session_id)
    return {"messages": msgs}

@app.get("/api/sessions/{session_id}/workspace")
def api_get_workspace_files(session_id: str, path: str = ""):
    """List files and directories in a session's workspace.
    
    Returns a tree structure with name, type (file/dir), size, and children.
    The optional `path` query param navigates into subdirectories.
    """
    workspace = get_session_workspace(session_id)
    target = os.path.join(workspace, path) if path else workspace
    target = os.path.realpath(target)
    
    # Security: prevent path traversal outside workspace
    if not target.startswith(os.path.realpath(workspace)):
        raise HTTPException(status_code=403, detail="Path traversal not allowed")
    
    if not os.path.exists(target):
        return {"files": [], "workspace_dir": workspace}
    
    entries = []
    try:
        for entry in sorted(os.listdir(target)):
            if entry.startswith('.'):
                continue  # Skip hidden files (.git, .DS_Store, etc.)
            full = os.path.join(target, entry)
            rel = os.path.relpath(full, workspace)
            if os.path.isdir(full):
                # Count children (non-hidden)
                try:
                    children_count = len([c for c in os.listdir(full) if not c.startswith('.')])
                except OSError:
                    children_count = 0
                entries.append({
                    "name": entry,
                    "path": rel,
                    "type": "directory",
                    "children_count": children_count,
                })
            else:
                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0
                entries.append({
                    "name": entry,
                    "path": rel,
                    "type": "file",
                    "size": size,
                    "extension": os.path.splitext(entry)[1].lstrip('.'),
                })
    except OSError:
        pass
    
    return {"files": entries, "workspace_dir": workspace}

@app.get("/api/sessions/{session_id}/workspace/read")
def api_read_workspace_file(session_id: str, path: str):
    """Read the contents of a file in a session's workspace."""
    workspace = get_session_workspace(session_id)
    target = os.path.join(workspace, path)
    target = os.path.realpath(target)
    
    if not target.startswith(os.path.realpath(workspace)):
        raise HTTPException(status_code=403, detail="Path traversal not allowed")
    
    if not os.path.isfile(target):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        size = os.path.getsize(target)
        if size > 512_000:  # 500KB limit
            return {"content": None, "truncated": True, "size": size, "path": path}
        with open(target, 'r', errors='replace') as f:
            content = f.read()
        return {"content": content, "truncated": False, "size": size, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------
# 3a. Agent & Skills Discovery
# ---------------------------------------------
@app.get("/api/agents")
def api_agents():
    """Return full agent registry with discovered skills."""
    return {"agents": get_all_agents()}

@app.get("/api/agents/{agent_id}/skills")
def api_agent_skills(agent_id: str):
    """Return skills for a specific agent."""
    skills = discover_skills(agent_id)
    return {"agent": agent_id, "skills": skills}

# ---------------------------------------------
# 3b. Hand Registry Endpoints (Managed Agents)
# ---------------------------------------------
@app.get("/api/hands")
def api_list_hands():
    """List all registered execution hands."""
    return {"hands": hand_registry.list_info()}

@app.get("/api/hands/health")
async def api_hands_health():
    """Health check all registered hands."""
    status = await hand_registry.health_check_all()
    return {"health": status}

# ---------------------------------------------
# 3c. Session Events API (Managed Agents Phase 2)
# ---------------------------------------------
@app.get("/api/sessions/{session_id}/events")
def api_session_events(
    session_id: str,
    start: int = 0,
    end: int = -1,
    event_type: Optional[str] = None,
    limit: int = 200,
):
    """Interrogate the session event log with positional slicing."""
    type_filter = [event_type] if event_type else None
    events = session_events.get_events(
        session_id, start=start, end=end,
        event_types=type_filter, limit=limit,
    )
    return {"session_id": session_id, "events": [e.to_dict() for e in events]}

@app.post("/api/sessions/{session_id}/wake")
def api_session_wake(session_id: str):
    """Resume a session — brain crash recovery via event log replay."""
    result = session_events.wake(session_id)
    return result

@app.post("/api/sessions/{session_id}/checkpoint")
def api_session_checkpoint(session_id: str, summary: str = ""):
    """Save a context checkpoint for recovery."""
    checkpoint_id = session_events.checkpoint(session_id, summary)
    return {"checkpoint_id": checkpoint_id, "session_id": session_id}

@app.get("/api/sessions/{session_id}/summary")
def api_session_summary(session_id: str):
    """High-level summary of a session's event log."""
    summary = session_events.get_session_summary(session_id)
    tokens = session_events.get_token_usage(session_id)
    return {**summary, "tokens": tokens}

# ---------------------------------------------
# 3d. Brain Orchestrator API (Managed Agents Phase 3)
# ---------------------------------------------
class BrainRunRequest(BaseModel):
    agent: str
    prompt: str
    workspace_dir: Optional[str] = None
    model: Optional[str] = None

@app.post("/api/brain/{session_id}/run")
async def api_brain_run(session_id: str, req: BrainRunRequest):
    """Execute a single turn through the stateless Brain."""
    workspace_dir = req.workspace_dir or get_session_workspace(session_id)
    kwargs = {}
    if req.model:
        kwargs["model"] = req.model
    result = await orchestrator.run(
        session_id, req.agent, req.prompt,
        workspace_dir=workspace_dir, **kwargs,
    )
    return result

@app.post("/api/brain/{session_id}/wake")
def api_brain_wake(session_id: str):
    """Wake the brain for a session — rebuild state from event log."""
    return orchestrator.wake(session_id)

@app.post("/api/brain/{session_id}/pause")
def api_brain_pause(session_id: str, summary: str = ""):
    """Pause the brain — save checkpoint and yield."""
    checkpoint_id = orchestrator.pause(session_id, summary)
    return {"checkpoint_id": checkpoint_id, "status": "paused"}

class DelegateRequest(BaseModel):
    from_agent: str
    to_agent: str
    prompt: str
    workspace_dir: Optional[str] = None

@app.post("/api/brain/{session_id}/delegate")
async def api_brain_delegate(session_id: str, req: DelegateRequest):
    """Delegate execution from one agent to another."""
    workspace_dir = req.workspace_dir or get_session_workspace(session_id)
    result = await orchestrator.delegate(
        session_id, req.from_agent, req.to_agent, req.prompt,
        workspace_dir=workspace_dir,
    )
    return result

@app.get("/api/brain/{session_id}/status")
def api_brain_status(session_id: str):
    """Get orchestrator status for a session."""
    return orchestrator.get_brain_status(session_id)

# --- Context Engine Endpoints ---
@app.get("/api/brain/{session_id}/context")
def api_brain_context(session_id: str, agent: str = "gemini"):
    """Build context window for a session using the specified agent's harness."""
    harness = harness_manager.select(agent)
    result = orchestrator.context.build_context(session_id, harness)
    return result

@app.get("/api/brain/{session_id}/context/stats")
def api_brain_context_stats(session_id: str, agent: str = "gemini"):
    """Get context utilization stats."""
    harness = harness_manager.select(agent)
    return orchestrator.context.get_context_stats(session_id, harness)

@app.get("/api/brain/{session_id}/context/rewind")
def api_brain_rewind(session_id: str, before_event_id: int, count: int = 10):
    """Rewind: get events leading up to a specific event."""
    return {"events": orchestrator.context.rewind(session_id, before_event_id, count)}

# --- Harness Config Endpoints ---
@app.get("/api/harnesses")
def api_list_harnesses():
    """List all harness configurations."""
    return {"harnesses": harness_manager.list_configs()}

@app.get("/api/harnesses/{agent}")
def api_get_harness(agent: str):
    """Get harness configuration for a specific agent."""
    return harness_manager.select(agent).to_dict()

# ---------------------------------------------
# 3e. Sandbox Pool API (Managed Agents Phase 5)
# ---------------------------------------------
class SandboxProvisionRequest(BaseModel):
    session_id: Optional[str] = None
    name: Optional[str] = None
    ttl_seconds: int = 86400

@app.post("/api/sandboxes")
def api_provision_sandbox(req: SandboxProvisionRequest):
    """Provision a new sandbox workspace."""
    sandbox = sandbox_pool.provision(
        session_id=req.session_id, name=req.name, ttl_seconds=req.ttl_seconds,
    )
    return sandbox.to_dict()

@app.get("/api/sandboxes")
def api_list_sandboxes():
    """List all active sandboxes."""
    return {"sandboxes": [s.to_dict() for s in sandbox_pool.list_active()]}

@app.get("/api/sandboxes/stats")
def api_sandbox_stats():
    """Get sandbox pool utilization stats."""
    return sandbox_pool.get_stats()

@app.delete("/api/sandboxes/{sandbox_id}")
def api_destroy_sandbox(sandbox_id: str):
    """Destroy a sandbox workspace."""
    success = sandbox_pool.destroy(sandbox_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Sandbox {sandbox_id} not found")
    return {"destroyed": sandbox_id}

@app.post("/api/sandboxes/gc")
def api_sandbox_gc():
    """Garbage-collect expired sandboxes."""
    destroyed = sandbox_pool.gc()
    return {"destroyed": destroyed, "count": len(destroyed)}

# ---------------------------------------------
# 3c. Daily Report Endpoints
# ---------------------------------------------
@app.get("/api/reports/daily")
def api_daily_report(date: Optional[str] = None, days: int = 1):
    """Get aggregated daily usage statistics."""
    stats = get_daily_stats(date, days)
    return stats

class ReportGenerateRequest(BaseModel):
    date: Optional[str] = None
    days: int = 1
    agent: str = "gemini"  # which agent to use for generation

@app.post("/api/reports/generate")
async def api_generate_report(req: ReportGenerateRequest):
    """Generate an AI narrative report using a selected agent."""
    stats = get_daily_stats(req.date, req.days)
    prompt = build_report_prompt(stats)
    
    # Execute via Hand Registry
    try:
        hand = hand_registry.get(req.agent)
        if not hand:
            raise HTTPException(status_code=404, detail=f"No hand registered for '{req.agent}'")

        result = await hand.execute(prompt, workspace_dir="/tmp/reports")
        return {
            "report": result.output,
            "stats": stats,
            "agent_used": req.agent,
            "prompt_length": len(prompt),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

# ---------------------------------------------
# 3c. Structured REST Endpoint (For External Desktop/Apps)
# ---------------------------------------------
# ─── Environment gate check (shared by REST + WebSocket) ─────
_ENV_GATES = {
    "gemini": "ENABLE_GEMINI_CLI",
    "claude": "ENABLE_CLAUDE_REMOTE_CONTROL",
    "codex": "ENABLE_CODEX_SERVER",
    "ollama": "ENABLE_OLLAMA_API",
    "mflux": "ENABLE_MFLUX_IMAGE",
}

def _check_env_gate(client: str):
    """Raise HTTPException if the agent route is disabled in .env."""
    gate = _ENV_GATES.get(client)
    if gate and os.getenv(gate) != "true":
        raise HTTPException(status_code=403, detail=f"{client} route disabled inside global .env")

@app.post("/execute", response_model=ExecutionResponse)
async def execute_task(req: ExecutionRequest):
    """
    Execute via Hand Registry: execute(name, input) → string.
    """
    _check_env_gate(req.client)

    hand = hand_registry.get(req.client)
    if not hand:
        raise HTTPException(status_code=404, detail=f"No hand registered for '{req.client}'")

    workspace_str = req.workspace_id or "default_sync"
    workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)

    target_opt_kwargs = {}
    if req.client == "ollama":
        target_opt_kwargs["model"] = req.model or "llama3"

    result = await hand.execute(req.prompt, workspace_dir=workspace_dir, **target_opt_kwargs)
    return ExecutionResponse(exitCode=result.exit_code, output=result.output)

from fastapi.responses import StreamingResponse
import asyncio
import json

@app.post("/execute/stream")
async def execute_task_stream(req: ExecutionRequest):
    """
    Execute streaming LLM task via Hand Registry using ndjson.
    """
    _check_env_gate(req.client)

    hand = hand_registry.get(req.client)
    if not hand:
        raise HTTPException(status_code=404, detail=f"No hand registered for '{req.client}'")

    workspace_str = req.workspace_id or "default_sync"
    workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)

    q = asyncio.Queue()

    async def stream_log(chunk: str):
        await q.put({"type": "node_execution_log", "log": chunk})

    target_opt_kwargs = {}
    if req.client == "ollama":
        target_opt_kwargs["model"] = req.model or "llama3"

    async def worker():
        try:
            await q.put({"type": "node_execution_started"})
            result = await hand.execute(req.prompt, workspace_dir=workspace_dir, on_log=stream_log, **target_opt_kwargs)
            if result.image_b64:
                await q.put({"type": "node_execution_image", "b64": result.image_b64})
            await q.put({"type": "node_execution_completed", "exitCode": result.exit_code})
        except Exception as e:
            await q.put({"type": "node_execution_log", "log": f"\n[Fatal Router Error] {e}\n"})
            await q.put({"type": "node_execution_completed", "exitCode": 1})

    async def generate_ndjson():
        task = asyncio.create_task(worker())
        while True:
            item = await q.get()
            yield json.dumps(item) + "\n"
            if item["type"] == "node_execution_completed":
                break
        await task

    return StreamingResponse(generate_ndjson(), media_type="application/x-ndjson")


# ─── Multi-Agent Execution API (Phase 9) ──────────────────────

class MultiAgentRequest(BaseModel):
    agents: list  # e.g. ["gemini", "claude"]
    prompt: str
    session_id: Optional[str] = None
    workspace_id: Optional[str] = None
    strategy: str = "first_success"  # first_success | majority_vote | best_effort | all
    timeout: float = 300.0

@app.post("/api/multi-agent/run")
async def multi_agent_run(req: MultiAgentRequest):
    """Fan-out a prompt to multiple agents, join results with a strategy."""
    for agent in req.agents:
        _check_env_gate(agent)
        if not hand_registry.get(agent):
            raise HTTPException(404, f"No hand registered for '{agent}'")

    session_id = req.session_id or f"multi_{uuid.uuid4().hex[:12]}"
    workspace_str = req.workspace_id or "default_sync"
    workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)

    result = await orchestrator.multi_agent_run(
        session_id=session_id,
        agents=req.agents,
        prompt=req.prompt,
        workspace_dir=workspace_dir,
        strategy=req.strategy,
        timeout=req.timeout,
    )

    return {
        "session_id": session_id,
        "strategy": req.strategy,
        "agents": req.agents,
        **result,
    }


from fastapi import WebSocket, WebSocketDisconnect

# ---------------------------------------------
# 4a. Background Task Status API
# ---------------------------------------------
@app.get("/api/tasks")
def api_list_tasks():
    """List all running/recent background tasks."""
    return {"tasks": task_manager.get_all_status()}

@app.get("/api/tasks/running")
def api_running_sessions():
    """Get session IDs that have actively running tasks."""
    return {"running_sessions": task_manager.get_running_session_ids()}

@app.get("/api/tasks/{session_id}")
def api_session_tasks(session_id: str):
    """Get all tasks for a session."""
    tasks = task_manager.get_session_tasks(session_id)
    return {"tasks": [t.status.to_dict() for t in tasks]}

@app.get("/api/tasks/history")
def api_task_history(session_id: Optional[str] = None, limit: int = 50):
    """Query persistent task history from SQLite."""
    return {"tasks": get_task_history(session_id=session_id, limit=limit)}

# ---------------------------------------------
# 4b. Session-Aware Native WebSocket Streaming
#     with Background Task Support
# ---------------------------------------------
@app.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket):
    """
    Desktop UI WebSocket handler with background task support.
    - Tasks run independently; switching sessions does NOT stop running tasks
    - Rich status phases: connecting → executing → streaming → finalizing
    - All events are broadcast to the WebSocket regardless of viewed session
    """
    await websocket.accept()
    print("Client natively connected to Python FastAPI WebSocket.")

    # Create a subscriber queue for this connection
    ws_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    task_manager.add_global_subscriber(ws_queue)

    # Background drainer: forwards task events to the WebSocket
    async def drain_queue():
        try:
            while True:
                event = await ws_queue.get()
                try:
                    await websocket.send_json(event)
                except Exception:
                    break
        except asyncio.CancelledError:
            pass

    drainer = asyncio.create_task(drain_queue())

    try:
        while True:
            data = await websocket.receive_json()

            # ─── Handle status query ─────
            if data.get("type") == "query_running":
                running = task_manager.get_all_status()
                await websocket.send_json({"type": "running_tasks", "tasks": running})
                continue

            # ─── Handle multi-agent run ─────
            if data.get("type") == "multi_agent_run":
                _agents = data.get("agents", [])
                _prompt = data.get("prompt", "")
                _session_id = data.get("sessionId")
                _strategy = data.get("strategy", "first_success")
                _timeout = data.get("timeout", 300.0)

                if not _agents or not _prompt:
                    await websocket.send_json({"type": "error", "message": "agents and prompt required"})
                    continue

                # Session persistence
                if _session_id:
                    add_message(_session_id, source='user', content=f"[Multi-Agent: {', '.join(_agents)}] {_prompt}", agent_type=_agents[0])
                    auto_title_session(_session_id)

                _workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', 'sessions', _session_id or 'multi_default')

                async def multi_task():
                    try:
                        await websocket.send_json({
                            "type": "multi_agent_started",
                            "sessionId": _session_id,
                            "agents": _agents,
                            "strategy": _strategy,
                        })

                        async def _multi_log(chunk: str):
                            try:
                                await websocket.send_json({
                                    "type": "node_execution_log",
                                    "sessionId": _session_id,
                                    "log": chunk,
                                })
                            except Exception:
                                pass

                        result = await orchestrator.multi_agent_run(
                            session_id=_session_id or f"multi_{uuid.uuid4().hex[:12]}",
                            agents=_agents,
                            prompt=_prompt,
                            workspace_dir=_workspace_dir,
                            strategy=_strategy,
                            timeout=_timeout,
                            on_log=_multi_log,
                        )

                        # Persist final result
                        if _session_id:
                            output_preview = result.get("output", "")[:2000]
                            add_message(_session_id, source='agent', content=output_preview, agent_type="multi")

                        await websocket.send_json({
                            "type": "multi_agent_completed",
                            "sessionId": _session_id,
                            "strategy": _strategy,
                            "agents": _agents,
                            "success": result.get("success"),
                            "output": result.get("output", "")[:5000],
                            "selected_agent": result.get("selected_agent"),
                            "all_results": [
                                {
                                    "agent": r.get("agent"),
                                    "success": r.get("success"),
                                    "exit_code": r.get("exit_code"),
                                    "output": r.get("output", "")[:1000],
                                }
                                for r in (result.get("all_results") or [])
                            ],
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "type": "multi_agent_error",
                            "sessionId": _session_id,
                            "error": str(e),
                        })

                asyncio.create_task(multi_task())
                continue

            # ─── Parse execution request ─────
            session_id = data.get("sessionId")

            if "type" in data and data["type"] == "command":
                mode = data.get("mode")
                prompt = data.get("content")
                node_id = data.get("nodeId", "sync_chat")
                workspace_str = data.get("workspaceId", "default_bridge")
                target_model = data.get("model")
            elif "type" in data and data["type"] == "execute_node":
                mode = data.get("client")
                prompt = data.get("prompt")
                node_id = data.get("nodeId", "execute_node")
                workspace_str = data.get("workflowId", "fallback_node")
                target_model = data.get("model")
            else:
                mode = data.get("mode") or data.get("client")
                prompt = data.get("content") or data.get("prompt")
                node_id = "generic"
                workspace_str = "default_bridge"
                target_model = data.get("model")

            if not mode or not prompt:
                continue

            # ─── Session persistence: store user message ─────
            if session_id:
                add_message(session_id, source='user', content=prompt, agent_type=mode)
                auto_title_session(session_id)
                session_events.emit_event(
                    session_id, EventType.USER_MESSAGE,
                    content=prompt, agent="user",
                )

            # ─── Environment gate check ─────
            gate = _ENV_GATES.get(mode)
            if gate and os.getenv(gate) != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "sessionId": session_id, "log": f"❌ {mode} disabled locally in .env\n"})
                if session_id:
                    session_events.emit_event(session_id, EventType.ERROR, content=f"{mode} disabled in .env", agent=mode)
                continue

            # ─── Resolve hand from registry ─────
            hand = hand_registry.get(mode)
            if not hand:
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "sessionId": session_id, "log": f"❌ No hand registered for '{mode}'\n"})
                if session_id:
                    session_events.emit_event(session_id, EventType.ERROR, content=f"No hand registered: {mode}", agent=mode)
                continue

            # ─── Create background task and launch ─────
            bg_task = task_manager.create_task(
                session_id=session_id or "untracked",
                agent=mode,
                prompt=prompt,
            )
            task_id = bg_task.task_id

            # Emit startup with task_id
            await websocket.send_json({
                "type": "node_execution_started",
                "nodeId": node_id,
                "sessionId": session_id,
                "taskId": task_id,
            })

            if session_id:
                session_events.emit_event(
                    session_id, EventType.AGENT_SELECTED,
                    agent=mode,
                    metadata={"hand_type": hand.hand_type, "node_id": node_id, "task_id": task_id},
                )

            # ─── Background worker function ─────
            async def run_task(
                _task_id: str, _session_id: str, _mode: str, _prompt: str,
                _hand, _node_id: str, _workspace_str: str, _target_model: str = None
            ):
                full_out_array = []

                async def stream_log(chunk: str):
                    full_out_array.append(chunk)
                    await task_manager.emit_output(_task_id, chunk, source="agent")

                try:
                    # Phase: CONNECTING
                    await task_manager.update_phase(_task_id, TaskPhase.CONNECTING)

                    # Resolve workspace
                    if _session_id and _session_id != "untracked":
                        workspace_dir = get_session_workspace(_session_id)
                    else:
                        workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', _workspace_str)
                        os.makedirs(workspace_dir, exist_ok=True)

                    target_opt_kwargs = {}
                    if _mode == "ollama" and _target_model:
                        target_opt_kwargs["model"] = _target_model

                    if _session_id and _session_id != "untracked":
                        session_events.emit_event(
                            _session_id, EventType.TOOL_CALL,
                            content=_prompt, agent=_mode,
                            metadata={"hand_type": _hand.hand_type, "workspace": workspace_dir, "task_id": _task_id},
                        )

                    # Phase: EXECUTING
                    await task_manager.update_phase(_task_id, TaskPhase.EXECUTING)

                    # Phase: STREAMING (set once first output arrives)
                    first_chunk = True
                    original_stream_log = stream_log

                    async def stream_log_with_phase(chunk: str):
                        nonlocal first_chunk
                        if first_chunk:
                            await task_manager.update_phase(_task_id, TaskPhase.STREAMING)
                            first_chunk = False
                        await original_stream_log(chunk)

                    # Execute via Hand Protocol
                    print(f"[Hand:{_hand.name}] Background task {_task_id} (session={_session_id}).")
                    result = await _hand.execute(
                        _prompt, workspace_dir=workspace_dir,
                        on_log=stream_log_with_phase, **target_opt_kwargs
                    )

                    # Phase: FINALIZING
                    await task_manager.update_phase(_task_id, TaskPhase.FINALIZING)

                    # Emit tool result/error event
                    if _session_id and _session_id != "untracked":
                        if result.success:
                            session_events.emit_event(
                                _session_id, EventType.TOOL_RESULT,
                                content=result.output[:2000],
                                agent=_mode,
                                metadata={"exit_code": result.exit_code, "output_length": len(result.output), "task_id": _task_id},
                            )
                        else:
                            session_events.emit_event(
                                _session_id, EventType.TOOL_ERROR,
                                content=result.output[:2000],
                                agent=_mode,
                                metadata={"exit_code": result.exit_code, "task_id": _task_id},
                            )

                        session_events.emit_event(
                            _session_id, EventType.METRIC,
                            agent=_mode,
                            metadata={
                                "input_tokens": len(_prompt) // 4,
                                "output_tokens": len(result.output) // 4,
                                "task_id": _task_id,
                            },
                        )

                    # Handle image output
                    if result.image_b64:
                        full_out_array.append("\n[System] Graphic successfully generated.")
                        await task_manager.emit_event(_task_id, {
                            "type": "node_execution_image",
                            "nodeId": _node_id,
                            "b64": result.image_b64,
                        })

                    # Session persistence
                    agent_output = "".join(full_out_array)
                    if _session_id and _session_id != "untracked":
                        add_message(
                            _session_id, source='agent', content=agent_output,
                            agent_type=_mode, image_b64=result.image_b64,
                        )
                        session_events.emit_event(
                            _session_id, EventType.AGENT_RESPONSE,
                            content=agent_output[:2000], agent=_mode,
                            metadata={"has_image": bool(result.image_b64), "task_id": _task_id},
                        )

                    # Phase: COMPLETED
                    await task_manager.update_phase(_task_id, TaskPhase.COMPLETED, exit_code=result.exit_code)

                    # Emit completed event
                    await task_manager.emit_event(_task_id, {
                        "type": "node_execution_completed",
                        "nodeId": _node_id,
                        "output": result.output[:500],
                        "exitCode": result.exit_code,
                    })

                except Exception as e:
                    print(f"[BackgroundTask:{_task_id}] Error: {e}")
                    await task_manager.update_phase(_task_id, TaskPhase.FAILED, exit_code=1, error=str(e))
                    await task_manager.emit_event(_task_id, {
                        "type": "node_execution_completed",
                        "nodeId": _node_id,
                        "exitCode": 1,
                    })

            # Launch as background task — does NOT block the WS loop
            _asyncio_task = asyncio.create_task(run_task(
                task_id, session_id, mode, prompt,
                hand, node_id, workspace_str,
                target_model if 'target_model' in dir() else None,
            ))
            bg_task.asyncio_task = _asyncio_task

    except WebSocketDisconnect:
        print("Frontend UI disconnected normally.")
    except Exception as e:
        print(f"WebSocket execution crash globally: {e}")
    finally:
        drainer.cancel()
        task_manager.remove_global_subscriber(ws_queue)
        # NOTE: Running background tasks continue even after WS disconnect
