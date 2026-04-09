import os
import json
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

from app.executor import run_cli_client
from app.history import init_db, save_log, get_logs
from app.agent_registry import get_all_agents, discover_skills
from app.report_engine import get_daily_stats, build_report_prompt
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
def startup_event():
    init_db()
    init_session_db()

@app.get("/api/logs")
def api_get_logs():
    return {"logs": get_logs()}

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
# 3b. Daily Report Endpoints
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
    
    # Execute via the CLI agent
    try:
        result = await run_cli_client(req.agent, prompt)
        return {
            "report": result,
            "stats": stats,
            "agent_used": req.agent,
            "prompt_length": len(prompt),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

# ---------------------------------------------
# 3c. Structured REST Endpoint (For External Desktop/Apps)
# ---------------------------------------------
@app.post("/execute", response_model=ExecutionResponse)
async def execute_task(req: ExecutionRequest):
    """
    Execute an arbitrary LLM task immediately from a trusted JSON payload constraint.
    Output formats are strictly evaluated under CLI limits.
    """
    # Environment Block evaluation exactly like Node JS
    if req.client == "gemini" and os.getenv("ENABLE_GEMINI_CLI") != "true":
        raise HTTPException(status_code=403, detail="Gemini route disabled inside global .env")
    elif req.client == "claude" and os.getenv("ENABLE_CLAUDE_REMOTE_CONTROL") != "true":
        raise HTTPException(status_code=403, detail="Claude route disabled inside global .env")
    elif req.client == "codex" and os.getenv("ENABLE_CODEX_SERVER") != "true":
        raise HTTPException(status_code=403, detail="Codex route disabled inside global .env")
    elif req.client == "ollama" and os.getenv("ENABLE_OLLAMA_API") != "true":
        raise HTTPException(status_code=403, detail="Ollama route disabled inside global .env")
    elif req.client == "mflux" and os.getenv("ENABLE_MFLUX_IMAGE") != "true":
        raise HTTPException(status_code=403, detail="MFLUX routing disabled inside global .env")

    workspace_str = req.workspace_id or "default_sync"
    workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)

    async def noop_log(msg: str):
        pass

    target_opt_kwargs = {}
    if req.client == "ollama":
        target_opt_kwargs["model"] = "llama3" # Default fallback for REST

    result = await run_cli_client(req.client, req.prompt, workspace_dir, noop_log, **target_opt_kwargs)
    return ExecutionResponse(exitCode=result["exitCode"], output=result["output"])

from fastapi.responses import StreamingResponse
import asyncio
import json

@app.post("/execute/stream")
async def execute_task_stream(req: ExecutionRequest):
    """
    Execute streaming LLM task using HTTP JSON Streams (ndjson).
    This allows CLI integrations and curl without WebSocket reliance.
    """
    if req.client == "gemini" and os.getenv("ENABLE_GEMINI_CLI") != "true":
        raise HTTPException(status_code=403, detail="Gemini route disabled")
    elif req.client == "claude" and os.getenv("ENABLE_CLAUDE_REMOTE_CONTROL") != "true":
        raise HTTPException(status_code=403, detail="Claude route disabled")
    elif req.client == "codex" and os.getenv("ENABLE_CODEX_SERVER") != "true":
        raise HTTPException(status_code=403, detail="Codex route disabled")
    elif req.client == "ollama" and os.getenv("ENABLE_OLLAMA_API") != "true":
        raise HTTPException(status_code=403, detail="Ollama route disabled")
    elif req.client == "mflux" and os.getenv("ENABLE_MFLUX_IMAGE") != "true":
        raise HTTPException(status_code=403, detail="MFLUX routing disabled")

    workspace_str = req.workspace_id or "default_sync"
    workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)

    q = asyncio.Queue()

    async def stream_log(chunk: str):
        await q.put({"type": "node_execution_log", "log": chunk})

    target_opt_kwargs = {}
    if req.client == "ollama" and req.model:
        target_opt_kwargs["model"] = req.model
    elif req.client == "ollama":
        target_opt_kwargs["model"] = "llama3"

    async def worker():
        try:
            await q.put({"type": "node_execution_started"})
            result = await run_cli_client(req.client, req.prompt, workspace_dir, stream_log, **target_opt_kwargs)
            if "image_b64" in result:
                await q.put({"type": "node_execution_image", "b64": result["image_b64"]})
            await q.put({"type": "node_execution_completed", "exitCode": result["exitCode"]})
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


from fastapi import WebSocket, WebSocketDisconnect

# ---------------------------------------------
# 4. Session-Aware Native WebSocket Streaming
# ---------------------------------------------
@app.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket):
    """
    Direct Desktop UI connection handler with session persistence.
    Messages are stored in sessions.db for cross-environment continuity.
    """
    await websocket.accept()
    print("Client natively connected to Python FastAPI WebSocket.")
    
    try:
        while True:
            data = await websocket.receive_json()
            
            # ─── Parse session ID from incoming message ─────
            session_id = data.get("sessionId")
            
            # Accommodate both old simple format {mode, content} or new execute_node wrapper
            if "type" in data and data["type"] == "command":
                 mode = data.get("mode")
                 prompt = data.get("content")
                 node_id = data.get("nodeId", "sync_chat")
                 workspace_str = data.get("workspaceId", "default_bridge")
            elif "type" in data and data["type"] == "execute_node":
                 # Emulates the provided execute_node snippet
                 mode = data.get("client")
                 prompt = data.get("prompt")
                 node_id = data.get("nodeId", "execute_node")
                 workspace_str = data.get("workflowId", "fallback_node")
                 target_model = data.get("model") # newly added for Ollama natively
            else:
                 # Fallback parser
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
                # Auto-title on first message
                auto_title_session(session_id)

            # Route Environment Validation Check
            if mode == "gemini" and os.getenv("ENABLE_GEMINI_CLI") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "sessionId": session_id, "log": "❌ Gemini disabled locally in .env\n"})
                continue
            elif mode == "claude" and os.getenv("ENABLE_CLAUDE_REMOTE_CONTROL") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "sessionId": session_id, "log": "❌ Claude disabled locally in .env\n"})
                continue
            elif mode == "codex" and os.getenv("ENABLE_CODEX_SERVER") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "sessionId": session_id, "log": "❌ Codex disabled locally in .env\n"})
                continue
            elif mode == "ollama" and os.getenv("ENABLE_OLLAMA_API") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "sessionId": session_id, "log": "❌ Ollama HTTP daemon disabled locally in .env\n"})
                continue
            elif mode == "mflux" and os.getenv("ENABLE_MFLUX_IMAGE") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "sessionId": session_id, "log": "❌ MFLUX Image Server endpoint disabled locally in .env\n"})
                continue

            # Emit startup
            await websocket.send_json({
                "type": "node_execution_started",
                "nodeId": node_id,
                "sessionId": session_id
            })

            full_out_array = []
            async def stream_log(chunk: str):
                full_out_array.append(chunk)
                await websocket.send_json({
                    "type": "node_execution_log",
                    "nodeId": node_id,
                    "sessionId": session_id,
                    "log": chunk
                })

            # ─── Resolve workspace directory from session ─────
            if session_id:
                workspace_dir = get_session_workspace(session_id)
            else:
                workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)
                os.makedirs(workspace_dir, exist_ok=True)
            
            target_opt_kwargs = {}
            if mode == "ollama" and target_model:
                target_opt_kwargs["model"] = target_model
            
            # Execute Native Asyncio Process
            print(f"Intercepted Native WebSocket invocation for '{mode}' (session={session_id}, cwd={workspace_dir}).")
            result = await run_cli_client(mode, prompt, workspace_dir, stream_log, **target_opt_kwargs)
            
            # Sub-intercept binary base64 graphic output payloads specifically!
            agent_image_b64 = None
            if "image_b64" in result:
                agent_image_b64 = result["image_b64"]
                full_out_array.append("\\n[System] Graphic successfully generated in response stream.")
                await websocket.send_json({
                    "type": "node_execution_image",
                    "nodeId": node_id,
                    "sessionId": session_id,
                    "b64": result["image_b64"]
                })
            
            # ─── Session persistence: store agent response ─────
            agent_output = "".join(full_out_array)
            if session_id:
                add_message(
                    session_id,
                    source='agent',
                    content=agent_output,
                    agent_type=mode,
                    image_b64=agent_image_b64
                )
            
            # Save the execution trace cleanly to SQLite (legacy log system)
            status_calc = "success" if result["exitCode"] == 0 else "error"
            title_calc = prompt[:40] + ("..." if len(prompt) > 40 else "")
            save_log(title=title_calc, agent=mode, status=status_calc, content=agent_output)
            
            # Emit completed
            await websocket.send_json({
                "type": "node_execution_completed",
                "nodeId": node_id,
                "sessionId": session_id,
                "output": result["output"],
                "exitCode": result["exitCode"]
            })

    except WebSocketDisconnect:
        print("Frontend UI disconnected normally.")
    except Exception as e:
        print(f"WebSocket execution crash globally: {e}")
