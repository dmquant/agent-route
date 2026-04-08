"""Data models for analyst persistence.

Pydantic models with SQLite serialisation for sessions, turns,
and user templates.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class AnalysisSessionModel(BaseModel):
    """Persisted analysis session."""

    id: str
    title: str = ""
    model: str = "claude"
    template_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalysisTurnModel(BaseModel):
    """A single turn within an analysis session."""

    id: str
    session_id: str
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserTemplateModel(BaseModel):
    """A user-created analysis template."""

    id: str
    name: str
    description: str = ""
    category: str = "custom"
    system_prompt: str
    output_schema: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
