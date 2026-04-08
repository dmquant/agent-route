"""FastAPI application entry point."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from configs.settings import get_settings
from libs.cache.redis_client import get_redis
from libs.db.session import engine
from libs.logging_config import setup_logging
from libs.mq.kafka_client import get_kafka

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle."""
    settings = get_settings()
    setup_logging(settings.log_level)
    logger.info("app_starting", env=settings.app_env)

    # Start Kafka producer
    kafka = get_kafka()
    try:
        await kafka.start_producer()
    except Exception as e:
        logger.warning("kafka_unavailable", error=str(e))

    yield

    # Shutdown
    logger.info("app_shutting_down")
    redis = get_redis()
    await redis.close()
    await kafka.close()
    await engine.dispose()
    logger.info("app_stopped")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="AI Stock Research Institute",
        description="Multi-agent stock analysis platform with 6 specialist analysts",
        version="0.1.0",
        lifespan=lifespan,
        debug=settings.app_debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.app_debug else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ──────────────────────────────────────────────
    from services.api.routes import agents, health

    app.include_router(health.router, tags=["health"])
    app.include_router(agents.router, prefix="/api/v1", tags=["agents"])

    return app


app = create_app()
