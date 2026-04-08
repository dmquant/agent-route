"""Health check endpoints."""

import structlog
from fastapi import APIRouter
from sqlalchemy import text

from libs.cache.redis_client import get_redis
from libs.db.session import async_session_factory

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Basic liveness probe."""
    return {"status": "ok", "service": "ai-stock-research"}


@router.get("/health/ready")
async def readiness_check() -> dict:
    """Deep readiness probe - checks all infrastructure dependencies."""
    checks: dict[str, dict] = {}

    # PostgreSQL
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        checks["postgres"] = {"status": "ok"}
    except Exception as e:
        checks["postgres"] = {"status": "error", "detail": str(e)}

    # Redis
    try:
        redis = get_redis()
        pong = await redis.ping()
        checks["redis"] = {"status": "ok" if pong else "error"}
    except Exception as e:
        checks["redis"] = {"status": "error", "detail": str(e)}

    all_ok = all(c["status"] == "ok" for c in checks.values())
    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
    }
