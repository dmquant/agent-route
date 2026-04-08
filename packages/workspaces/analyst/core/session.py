"""Analysis session lifecycle management.

Tracks conversation context for follow-up queries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4


@dataclass
class AnalysisSession:
    """Represents a single analysis conversation."""

    id: str = field(default_factory=lambda: uuid4().hex)
    created_at: datetime = field(default_factory=datetime.utcnow)
    turns: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class SessionManager:
    """Creates, retrieves, and manages analysis sessions."""

    async def create(self, **kwargs: Any) -> AnalysisSession:
        """Create a new analysis session."""
        raise NotImplementedError

    async def get(self, session_id: str) -> AnalysisSession:
        """Retrieve a session by ID."""
        raise NotImplementedError

    async def add_turn(self, session_id: str, turn: dict[str, Any]) -> None:
        """Append a turn (user input + model output) to a session."""
        raise NotImplementedError

    async def list(self, limit: int = 50, offset: int = 0) -> list[AnalysisSession]:
        """List sessions ordered by creation time."""
        raise NotImplementedError
