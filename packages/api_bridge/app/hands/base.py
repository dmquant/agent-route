"""Hand Protocol — the universal agent execution interface.

Every agent (CLI, HTTP, MCP) implements:
  execute(input, **kwargs) → HandResult
  stream(input, **kwargs)  → AsyncGenerator[str]
  health_check()           → bool

Inspired by Anthropic's Managed Agents: execute(name, input) → string
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, AsyncGenerator, Callable, Any, List
import re

# ─── Shared Noise Filters ──────────────────────────
# Known CLI boilerplate lines that pollute user-facing output
_NOISE_PATTERNS = [
    # Gemini SDK internals
    re.compile(r'Timeout of \d+ exceeds the interval'),
    re.compile(r"The 'metricReader' option is deprecated"),
    re.compile(r'Loaded cached credentials'),
    re.compile(r'Loading extension:'),
    re.compile(r'Scheduling MCP context refresh'),
    re.compile(r'Executing MCP context refresh'),
    re.compile(r'MCP context refresh complete'),
    re.compile(r'Error executing tool \w+: Tool .* not found'),
    re.compile(r'\[LocalAgentExecutor\] Skipping subagent tool'),
    re.compile(r'\[LocalAgentExecutor\] Blocked call'),
    # Codex startup banner
    re.compile(r'Reading additional input from stdin'),
    re.compile(r'^-+$'),
    re.compile(r'^OpenAI Codex v[\d.]+'),
    re.compile(r'^workdir:'),
    re.compile(r'^model:'),
    re.compile(r'^provider:'),
    re.compile(r'^approval:'),
    re.compile(r'^sandbox:'),
    re.compile(r'^reasoning effort:'),
    re.compile(r'^reasoning summaries:'),
    re.compile(r'^session id:'),
    re.compile(r'codex_core_skills::loader: failed to stat skills entry'),
    # Generic npx noise
    re.compile(r'^npm warn'),
    re.compile(r'^npm notice'),
]


def filter_noise(text: str) -> str:
    """Remove known CLI boilerplate noise while preserving meaningful output."""
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned.append(line)
            continue
        if any(p.search(stripped) for p in _NOISE_PATTERNS):
            continue
        cleaned.append(line)
    result = '\n'.join(cleaned)
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result


@dataclass
class HandResult:
    """Universal result from any hand execution."""
    output: str
    exit_code: int
    image_b64: Optional[str] = None
    artifacts: List[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.exit_code == 0

    def to_dict(self) -> dict:
        d = {"output": self.output, "exitCode": self.exit_code}
        if self.image_b64:
            d["image_b64"] = self.image_b64
        if self.artifacts:
            d["artifacts"] = self.artifacts
        return d


class Hand(ABC):
    """Universal hand interface: execute(name, input) → string.

    Every agent—CLI, HTTP, or MCP—implements this protocol.
    Brains call hands without knowing the transport underneath.
    """

    name: str = "unknown"
    hand_type: str = "unknown"  # "cli" | "http" | "mcp"
    description: str = ""

    @abstractmethod
    async def execute(
        self,
        input: str,
        workspace_dir: str = "/tmp",
        on_log: Optional[Callable[[str], Any]] = None,
        **kwargs,
    ) -> HandResult:
        """Run a task and return structured output.

        Args:
            input: The prompt / task to execute
            workspace_dir: Isolated working directory
            on_log: Callback for streaming log chunks to the UI
            **kwargs: Agent-specific options (e.g. model for Ollama)
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Is this hand available and responsive?"""
        ...

    def info(self) -> dict:
        """Serializable hand metadata."""
        return {
            "name": self.name,
            "type": self.hand_type,
            "description": self.description,
        }

    def __repr__(self):
        return f"<Hand:{self.name} type={self.hand_type}>"
