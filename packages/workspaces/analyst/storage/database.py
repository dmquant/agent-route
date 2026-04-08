"""SQLite connection management and schema migrations.

Uses aiosqlite for async access.
"""

from __future__ import annotations

from typing import Any


class Database:
    """Manages the SQLite connection pool and migrations."""

    def __init__(self, db_path: str = "data/analyst.db") -> None:
        self.db_path = db_path

    async def initialize(self) -> None:
        """Create tables and run pending migrations."""
        raise NotImplementedError

    async def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        """Execute a write query."""
        raise NotImplementedError

    async def fetch_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        """Fetch a single row."""
        raise NotImplementedError

    async def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        """Fetch all matching rows."""
        raise NotImplementedError

    async def close(self) -> None:
        """Close the database connection."""
        raise NotImplementedError
