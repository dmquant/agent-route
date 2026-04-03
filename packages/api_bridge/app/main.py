import os
import json
import asyncio
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import websockets

from app.executor import run_cli_client

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

class ExecutionResponse(BaseModel):
    exitCode: Optional[int]
    output: str

# ---------------------------------------------
# 1. Structured REST Endpoint (For External Desktop/Apps)
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

    workspace_str = req.workspace_id or "default_sync"
    workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)

    # Empty callback for REST
    async def noop_log(msg: str):
        pass

    result = await run_cli_client(req.client, req.prompt, workspace_dir, noop_log)
    return ExecutionResponse(exitCode=result["exitCode"], output=result["output"])


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
            else:
                 # Fallback parser
                 mode = data.get("mode") or data.get("client")
                 prompt = data.get("content") or data.get("prompt")
                 node_id = "generic"
                 workspace_str = "default_bridge"

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

            # Emit startup
            await websocket.send_json({
                "type": "node_execution_started",
                "nodeId": node_id
            })

            async def stream_log(chunk: str):
                await websocket.send_json({
                    "type": "node_execution_log",
                    "nodeId": node_id,
                    "log": chunk
                })

            workspace_dir = os.path.join(os.getcwd(), '..', 'workspaces', workspace_str)
            
            # Execute Native Asyncio Process
            print(f"Intercepted Native WebSocket invocation for '{mode}'.")
            result = await run_cli_client(mode, prompt, workspace_dir, stream_log)
            
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
