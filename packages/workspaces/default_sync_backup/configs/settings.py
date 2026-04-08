"""Application configuration via pydantic-settings.

All settings are loaded from environment variables (or .env file).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the AI Stock Research platform."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Application ──────────────────────────────────────────
    app_name: str = "ai-stock-research"
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "DEBUG"
    preferred_connector: str = "tushare" # wind or tushare

    # ── PostgreSQL ───────────────────────────────────────────
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "ai_institute"
    postgres_password: str = "ai_institute_dev"
    postgres_db: str = "ai_institute"

    # ── Redis ────────────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = "ai_institute_dev"
    redis_db: int = 0

    # ── Kafka ────────────────────────────────────────────────
    kafka_bootstrap_servers: str = "localhost:9092"

    # ── Wind API ─────────────────────────────────────────────
    wind_username: str = ""
    wind_password: str = ""
    wind_rate_limit: int = 10  # requests per second
    wind_batch_size: int = 100  # stocks per request
    wind_retry_max: int = 3

    # ── East Money Scraper ───────────────────────────────────
    eastmoney_rate_limit: float = 2.0  # requests per second
    eastmoney_proxy_pool_url: str = ""
    eastmoney_user_agents: list[str] = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    ]

    # ── Tushare API ──────────────────────────────────────────
    tushare_token: str = ""
    tushare_rate_limit: int = 200  # requests per minute
    tushare_retry_max: int = 5
    tushare_batch_size: int = 5000  # max records per request for most interfaces

    @property
    def database_url(self) -> str:
        """Async PostgreSQL connection string."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync PostgreSQL connection string (for Alembic migrations)."""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        """Redis connection string."""
        return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def kafka_servers_list(self) -> list[str]:
        """Kafka bootstrap servers as a list."""
        return [s.strip() for s in self.kafka_bootstrap_servers.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Return cached settings singleton."""
    return Settings()
