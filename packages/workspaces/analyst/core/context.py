"""Multi-source context assembly for analysis prompts.

Combines text, documents, pasted data, and URL content into a
unified prompt context while respecting per-model token budgets.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PromptContext:
    """Assembled context ready for dispatch to a model."""

    system_prompt: str = ""
    user_content: str = ""
    attachments: list[dict[str, Any]] = field(default_factory=list)
    token_estimate: int = 0


class ContextAssembler:
    """Builds a unified PromptContext from heterogeneous inputs."""

    async def build(
        self,
        inputs: list[dict[str, Any]],
        model: str = "claude",
    ) -> PromptContext:
        """Assemble inputs into a PromptContext, respecting model limits."""
        raise NotImplementedError
