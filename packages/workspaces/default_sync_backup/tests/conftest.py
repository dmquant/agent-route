"""Shared test fixtures."""

import os

import pytest

# Set test environment before importing app code
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_DEBUG", "false")
os.environ.setdefault("POSTGRES_DB", "ai_institute_test")


@pytest.fixture
def settings():
    """Return test settings instance (uncached)."""
    from configs.settings import Settings

    return Settings(
        app_env="test",
        app_debug=False,
        postgres_db="ai_institute_test",
    )
