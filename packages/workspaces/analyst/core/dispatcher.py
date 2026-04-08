"""Dispatcher — wraps the gateway executor with analyst context.

Injects template instructions and output schema directives before
delegating to the existing executor pipeline.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from .context import PromptContext
from .session import AnalysisSession


class Dispatcher:
    """Executes analysis requests through the gateway executor."""

    async def execute(
        self,
        session: AnalysisSession,
        context: PromptContext,
        model: str = "claude",
    ) -> AsyncIterator[str]:
        """Stream model output for the given session and context."""
        raise NotImplementedError
        yield  # make this a generator  # noqa: E501
