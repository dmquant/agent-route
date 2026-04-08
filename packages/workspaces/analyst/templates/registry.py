"""Template catalogue — built-in and user-created templates.

Supports CRUD operations for user templates.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TemplateInfo:
    """Metadata for an analysis template."""

    id: str
    name: str
    description: str
    category: str
    builtin: bool = True


class TemplateRegistry:
    """Manages the catalogue of analysis templates."""

    async def list(self) -> list[TemplateInfo]:
        """Return all available templates."""
        raise NotImplementedError

    async def get(self, template_id: str) -> dict[str, Any]:
        """Get full template definition by ID."""
        raise NotImplementedError

    async def create(self, template: dict[str, Any]) -> TemplateInfo:
        """Create a user-defined template."""
        raise NotImplementedError

    async def delete(self, template_id: str) -> None:
        """Delete a user-defined template."""
        raise NotImplementedError
