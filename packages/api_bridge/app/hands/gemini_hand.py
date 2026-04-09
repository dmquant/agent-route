"""Gemini CLI Hand — Google DeepMind's Gemini agent via npx."""

import asyncio
import os
import json
import re
import shutil
from typing import Optional, Callable, Any

from app.hands.base import Hand, HandResult, filter_noise


def _parse_gemini_json_output(raw: str) -> str:
    """Extract response text from Gemini's --output-format json output."""
    try:
        data = json.loads(raw.strip())
        if isinstance(data, list):
            parts = []
            for item in data:
                if isinstance(item, dict):
                    resp = item.get('response', item)
                    if isinstance(resp, dict):
                        parts.append(resp.get('text', ''))
                    elif isinstance(resp, str):
                        parts.append(resp)
            if parts:
                return '\n'.join(parts)
        elif isinstance(data, dict):
            resp = data.get('response', data)
            if isinstance(resp, dict):
                return resp.get('text', raw)
    except (json.JSONDecodeError, TypeError):
        pass

    # Fallback: line-delimited JSON
    parts = []
    for line in raw.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        try:
            chunk = json.loads(line)
            if isinstance(chunk, dict):
                text = chunk.get('text', '') or chunk.get('response', {}).get('text', '')
                if text:
                    parts.append(text)
        except (json.JSONDecodeError, TypeError):
            parts.append(line)

    return '\n'.join(parts) if parts else raw


class GeminiHand(Hand):
    """Gemini CLI agent via `npx gemini`."""

    name = "gemini"
    hand_type = "cli"
    description = "Google Gemini CLI — gemini-2.5-pro with MCP tools"

    async def execute(
        self,
        input: str,
        workspace_dir: str = "/tmp",
        on_log: Optional[Callable[[str], Any]] = None,
        **kwargs,
    ) -> HandResult:
        skills_dir = os.path.expanduser("~/.gemini/skills")
        cmd = "npx"
        args = [
            "gemini", "-p", input,
            "--output-format", "json",
            "--yolo",
            "--include-directories", skills_dir,
        ]

        os.makedirs(workspace_dir, exist_ok=True)
        await self._ensure_git(workspace_dir)

        if on_log:
            short_dir = os.path.basename(workspace_dir)[:12]
            await on_log(f"⚡ Executing with **gemini** (workspace: `{short_dir}…`)\n")

        try:
            process = await asyncio.create_subprocess_exec(
                cmd, *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workspace_dir,
            )
        except Exception as e:
            msg = f"Failed to spawn gemini: {e}"
            if on_log:
                await on_log(f"❌ {msg}\n")
            return HandResult(output=msg, exit_code=1)

        stdout, stderr = await self._read_output(process)
        exit_code = await process.wait()

        # Parse JSON output → extract response text
        parsed = _parse_gemini_json_output(stdout)
        output_text = filter_noise(parsed).strip()

        if output_text and on_log:
            await on_log(output_text)
        elif exit_code != 0 and on_log:
            await on_log(f"Process exited with code {exit_code} (no output captured).")

        return HandResult(output=output_text or f"Exit code {exit_code}", exit_code=exit_code)

    async def health_check(self) -> bool:
        return shutil.which("npx") is not None

    # ─── Internal helpers ─────────────

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
