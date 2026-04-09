"""Codex CLI Hand — OpenAI's Codex agent via npx."""

import asyncio
import os
import re
import shutil
from typing import Optional, Callable, Any

from app.hands.base import Hand, HandResult, filter_noise


class CodexHand(Hand):
    """Codex CLI agent via `npx codex`."""

    name = "codex"
    hand_type = "cli"
    description = "OpenAI Codex CLI — code generation with sandbox"

    async def execute(
        self,
        input: str,
        workspace_dir: str = "/tmp",
        on_log: Optional[Callable[[str], Any]] = None,
        **kwargs,
    ) -> HandResult:
        cmd = "npx"
        args = ["codex", "exec", "--skip-git-repo-check",
                "--dangerously-bypass-approvals-and-sandbox", input]

        os.makedirs(workspace_dir, exist_ok=True)
        await self._ensure_git(workspace_dir)

        if on_log:
            short_dir = os.path.basename(workspace_dir)[:12]
            await on_log(f"⚡ Executing with **codex** (workspace: `{short_dir}…`)\n")

        try:
            process = await asyncio.create_subprocess_exec(
                cmd, *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workspace_dir,
            )
        except Exception as e:
            msg = f"Failed to spawn codex: {e}"
            if on_log:
                await on_log(f"❌ {msg}\n")
            return HandResult(output=msg, exit_code=1)

        stdout, stderr = await self._read_output(process)
        exit_code = await process.wait()

        # Codex-specific: filter banner noise + strip echo
        combined = stdout + stderr
        output_text = filter_noise(combined)
        output_text = re.sub(r'^user\n.*?\nassistant\n', '', output_text, flags=re.DOTALL)
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
