"""Tests for configuration management."""

import pytest

from configs.settings import Settings


@pytest.mark.unit
class TestSettings:
    """Configuration unit tests."""

    def test_default_settings(self):
        """Settings should load with sane defaults."""
        s = Settings()
        assert s.app_name == "ai-stock-research"
        assert s.postgres_port == 5432
        assert s.redis_port == 6379

    def test_database_url(self):
        """Database URL should be constructed correctly."""
        s = Settings(
            postgres_user="u",
            postgres_password="p",
            postgres_host="h",
            postgres_port=5432,
            postgres_db="d",
        )
        assert s.database_url == "postgresql+asyncpg://u:p@h:5432/d"
        assert s.database_url_sync == "postgresql://u:p@h:5432/d"

    def test_redis_url(self):
        """Redis URL should include password."""
        s = Settings(redis_password="secret", redis_host="r", redis_port=6379, redis_db=2)
        assert s.redis_url == "redis://:secret@r:6379/2"

    def test_kafka_servers_list(self):
        """Kafka servers string should be split into a list."""
        s = Settings(kafka_bootstrap_servers="host1:9092,host2:9092")
        assert s.kafka_servers_list == ["host1:9092", "host2:9092"]

    def test_app_env_override(self):
        """Environment can be overridden via constructor."""
        s = Settings(app_env="production")
        assert s.app_env == "production"

    def test_debug_override(self):
        """Debug mode can be toggled via constructor."""
        s = Settings(app_debug=False)
        assert s.app_debug is False
