import os
import json
import asyncio
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import websockets
import httpx

from app.executor import run_cli_client
from app.history import init_db, save_log, get_logs

# Boot Environment Configurations
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), '.env')
load_dotenv(dotenv_path=env_path)

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

# ---------------------------------------------
# 1. Native Model Discovery & Configuration
# ---------------------------------------------
@app.on_event("startup")
def startup_event():
    init_db()

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
# 2. Structured REST Endpoint (For External Desktop/Apps)
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
# 2. Native Native WebSocket Streaming (Bypassing Cloudflare)
# ---------------------------------------------
@app.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket):
    """
    Direct Desktop UI connection handler mapping exactly to the React dashboard expectations.
    """
    await websocket.accept()
    print("Client natively connected to Python FastAPI WebSocket.")
    
    try:
        while True:
            data = await websocket.receive_json()
            
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

            # Route Environment Validation Check
            if mode == "gemini" and os.getenv("ENABLE_GEMINI_CLI") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "log": "❌ Gemini disabled locally in .env\n"})
                continue
            elif mode == "claude" and os.getenv("ENABLE_CLAUDE_REMOTE_CONTROL") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "log": "❌ Claude disabled locally in .env\n"})
                continue
            elif mode == "codex" and os.getenv("ENABLE_CODEX_SERVER") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "log": "❌ Codex disabled locally in .env\n"})
                continue
            elif mode == "ollama" and os.getenv("ENABLE_OLLAMA_API") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "log": "❌ Ollama HTTP daemon disabled locally in .env\n"})
                continue
            elif mode == "mflux" and os.getenv("ENABLE_MFLUX_IMAGE") != "true":
                await websocket.send_json({"type": "node_execution_log", "nodeId": node_id, "log": "❌ MFLUX Image Server endpoint disabled locally in .env\n"})
                continue

            # Emit startup
            await websocket.send_json({
                "type": "node_execution_started",
                "nodeId": node_id
            })

            full_out_array = []
            async def stream_log(chunk: str):
                full_out_array.append(chunk)
                await websocket.send_json({
                    "type": "node_execution_log",
                    "nodeId": node_id,
                    "log": chunk
                })

            workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)
            
            target_opt_kwargs = {}
            if mode == "ollama" and target_model:
                target_opt_kwargs["model"] = target_model
            
            # Execute Native Asyncio Process
            print(f"Intercepted Native WebSocket invocation for '{mode}'.")
            result = await run_cli_client(mode, prompt, workspace_dir, stream_log, **target_opt_kwargs)
            
            # Sub-intercept binary base64 graphic output payloads specifically!
            if "image_b64" in result:
                full_out_array.append("\\n[System] Graphic successfully generated in response stream.")
                await websocket.send_json({
                    "type": "node_execution_image",
                    "nodeId": node_id,
                    "b64": result["image_b64"]
                })
            
            # Save the execution trace cleanly to SQLite
            status_calc = "success" if result["exitCode"] == 0 else "error"
            title_calc = prompt[:40] + ("..." if len(prompt) > 40 else "")
            save_log(title=title_calc, agent=mode, status=status_calc, content="".join(full_out_array))
            
            # Emit completed
            await websocket.send_json({
                "type": "node_execution_completed",
                "nodeId": node_id,
                "output": result["output"],
                "exitCode": result["exitCode"]
            })

    except WebSocketDisconnect:
        print("Frontend UI disconnected normally.")
    except Exception as e:
        print(f"WebSocket execution crash globally: {e}")
