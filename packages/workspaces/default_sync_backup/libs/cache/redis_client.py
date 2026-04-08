"""Redis client for caching and pub/sub."""

import json
from typing import Any

import redis.asyncio as aioredis
import structlog

from configs.settings import get_settings

logger = structlog.get_logger(__name__)


class RedisClient:
    """Async Redis client wrapper with JSON serialization helpers."""

    def __init__(self) -> None:
        settings = get_settings()
        self._pool = aioredis.ConnectionPool.from_url(
            settings.redis_url,
            max_connections=20,
            decode_responses=True,
        )
        self._client = aioredis.Redis(connection_pool=self._pool)

    @property
    def client(self) -> aioredis.Redis:
        """Raw Redis client for advanced operations."""
        return self._client

    async def ping(self) -> bool:
        """Check Redis connectivity."""
        try:
            return await self._client.ping()
        except Exception as e:
            logger.error("redis_ping_failed", error=str(e))
            return False

    async def get_json(self, key: str) -> Any | None:
        """Get and deserialize a JSON value."""
        raw = await self._client.get(key)
        if raw is None:
            return None
        return json.loads(raw)

    async def set_json(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Serialize and store a JSON value."""
        payload = json.dumps(value, default=str)
        if ttl:
            await self._client.setex(key, ttl, payload)
        else:
            await self._client.set(key, payload)

    async def delete(self, key: str) -> None:
        """Delete a key."""
        await self._client.delete(key)

    async def close(self) -> None:
        """Close the connection pool."""
        await self._pool.aclose()


_instance: RedisClient | None = None


def get_redis() -> RedisClient:
    """Return a singleton RedisClient instance."""
    global _instance
    if _instance is None:
        _instance = RedisClient()
    return _instance
