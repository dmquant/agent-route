"""Analyst-specific configuration via Pydantic Settings.

All settings are overridable via ANALYST_* environment variables.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class AnalystSettings(BaseSettings):
    """Configuration for the Analyst workspace."""

    # Storage
    db_path: Path = Path("data/analyst.db")
    upload_dir: Path = Path("data/uploads")
    export_dir: Path = Path("data/exports")
    max_upload_size_mb: int = 10
    max_storage_mb: int = 1024
    upload_retention_days: int = 7

    # Analysis
    default_model: str = "claude"
    default_temperature: float = 0.3
    max_input_chars: int = 100_000
    max_conversation_turns: int = 50

    # URL Fetching
    url_fetch_enabled: bool = True
    url_fetch_timeout: int = 15
    url_max_size_mb: int = 5

    model_config = SettingsConfigDict(
        env_prefix="ANALYST_",
        env_file=".env",
    )


def get_settings() -> AnalystSettings:
    """Return a cached settings instance."""
    return AnalystSettings()
