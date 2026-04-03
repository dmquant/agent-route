import asyncio
import os
import sys
import json
import httpx
from typing import Callable, Any

async def run_cli_client(
    client_name: str,
    prompt: str,
    workspace_dir: str,
    on_log: Callable[[str], Any],
    **kwargs
) -> dict:
    """Executes the CLI specific to the client and routes stdout securely to on_log."""
    cmd = ""
    args = []

    if client_name == "gemini":
        cmd = "npx"
        args = ["gemini", "-p", prompt, "--output-format", "json"]
    elif client_name == "claude":
        cmd = "npx"
        args = ["@anthropic-ai/claude-code", "-p", "--dangerously-skip-permissions", prompt]
    elif client_name == "codex":
        cmd = "npx"
        args = ["codex", "exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", prompt]
    else:
        cmd = "echo"
        args = [f"Unknown client requested: {client_name}. Falling back to default mock logging."]

    # Enforce workspace directory creation
    os.makedirs(workspace_dir, exist_ok=True)
    
    # Send a sys log
    await on_log(f"[System] Executing task natively securely.\nTarget: {client_name}\nDirectory: {workspace_dir}\n")

    full_output = []

    # -----------------------
    # NATIVE HTTP STREAMING (Ollama)
    # -----------------------
    if client_name == "ollama":
        target_model = kwargs.get("model", "llama3")
        await on_log(f"\n[System] Connecting natively to localhost:11434 for {target_model}...\n")
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST", 
                    "http://localhost:11434/api/generate", 
                    json={"model": target_model, "prompt": prompt},
                    timeout=180.0
                ) as response:
                    if response.status_code != 200:
                        error_msg = f"[Fatal] Ollama API Error: {response.status_code}"
                        await on_log(error_msg + "\n")
                        return {"output": error_msg, "exitCode": 1}
                    
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                chunk = json.loads(line)
                                text = chunk.get("response", "")
                                full_output.append(text)
                                await on_log(text)
                            except json.JSONDecodeError:
                                pass
            return {"output": "".join(full_output), "exitCode": 0}
        except Exception as e:
            error_msg = f"Failed to connect to local Ollama Instance: {e}"
            await on_log(f"\n[Fatal] {error_msg}\n")
            return {"output": error_msg, "exitCode": 1}

    # -----------------------
    # OS NATIVE CLI DRIVERS
    # -----------------------
    try:
        # Generate the asynchronous subprocess mapped natively to our system
        process = await asyncio.create_subprocess_exec(
            cmd,
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=workspace_dir
        )
    except Exception as e:
        error_msg = f"Failed to spawn underlying executable: {e}"
        await on_log(f"[Fatal] {error_msg}\n")
        return {"output": error_msg, "exitCode": 1}

    full_output = []

    async def read_stream(stream, is_stderr=False):
        while True:
            line = await stream.read(1024)
            if not line:
                break
            text = line.decode('utf-8', errors='replace')
            full_output.append(text)
            await on_log(text)

    # Gather background tasks simultaneously
    await asyncio.gather(
        read_stream(process.stdout),
        read_stream(process.stderr, is_stderr=True)
    )

    exit_code = await process.wait()
    return {"output": "".join(full_output), "exitCode": exit_code}
