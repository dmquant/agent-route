import asyncio
import os
import sys
from typing import Callable, Any

async def run_cli_client(
    client_name: str,
    prompt: str,
    workspace_dir: str,
    on_log: Callable[[str], Any]
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
    await on_log(f"[System] Executing headless background task securely.\nDirectory: {workspace_dir}\n")

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
