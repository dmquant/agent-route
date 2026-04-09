"""Claude Code Hand — Anthropic's Claude Code agent via npx."""

import asyncio
import os
import re
import shutil
from typing import Optional, Callable, Any

from app.hands.base import Hand, HandResult, filter_noise


class ClaudeHand(Hand):
    """Claude Code CLI agent via `npx @anthropic-ai/claude-code`."""

    name = "claude"
    hand_type = "cli"
    description = "Anthropic Claude Code — claude-sonnet-4 with long context"

    async def execute(
        self,
        input: str,
        workspace_dir: str = "/tmp",
        on_log: Optional[Callable[[str], Any]] = None,
        **kwargs,
    ) -> HandResult:
        cmd = "npx"
        args = ["@anthropic-ai/claude-code", "-p", "--dangerously-skip-permissions", input]

        os.makedirs(workspace_dir, exist_ok=True)
        await self._ensure_git(workspace_dir)

        if on_log:
            short_dir = os.path.basename(workspace_dir)[:12]
            await on_log(f"⚡ Executing with **claude** (workspace: `{short_dir}…`)\n")

        try:
            process = await asyncio.create_subprocess_exec(
                cmd, *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workspace_dir,
            )
        except Exception as e:
            msg = f"Failed to spawn claude: {e}"
            if on_log:
                await on_log(f"❌ {msg}\n")
            return HandResult(output=msg, exit_code=1)

        stdout, stderr = await self._read_output(process)
        exit_code = await process.wait()

        # Claude-specific: error handling
        if exit_code != 0 and not stdout.strip():
            try:
                err_match = re.search(r'\{.*"message"\s*:\s*"([^"]+)"', stderr)
                if err_match:
                    output_text = f"❌ Claude Error: {err_match.group(1)}"
                else:
                    output_text = filter_noise(stderr) or stderr
            except Exception:
                output_text = stderr
        else:
            output_text = stdout

        output_text = output_text.strip()

        if output_text and on_log:
            await on_log(output_text)
        elif exit_code != 0 and on_log:
            await on_log(f"Process exited with code {exit_code} (no output captured).")

        return HandResult(output=output_text or f"Exit code {exit_code}", exit_code=exit_code)

    async def health_check(self) -> bool:
        return shutil.which("npx") is not None

    async def _ensure_git(self, workspace_dir: str):
        git_dir = os.path.join(workspace_dir, '.git')
        if not os.path.exists(git_dir):
            try:
                proc = await asyncio.create_subprocess_exec(
                    'git', 'init', cwd=workspace_dir,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await proc.wait()
            except Exception:
                pass

    async def _read_output(self, process) -> tuple:
        raw_stdout, raw_stderr = [], []

        async def read_stream(stream, acc):
            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    break
                acc.append(chunk.decode('utf-8', errors='replace'))

        await asyncio.gather(
            read_stream(process.stdout, raw_stdout),
            read_stream(process.stderr, raw_stderr),
        )
        return ''.join(raw_stdout), ''.join(raw_stderr)
