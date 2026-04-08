"""FastAPI application for the financial data collection pipeline."""

import asyncio
from typing import Dict, Optional, List, Type

import structlog
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from configs.settings import get_settings
from libs.db.session import async_session_factory, get_db
from libs.schemas.market_data import SyncStatus
from libs.data.connector import BaseConnector
from libs.data.wind_connector import WindConnector
from libs.data.tushare_connector import TushareConnector
from services.data_connector.pipeline import SyncPipeline

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="Data collection Pipeline",
    description="Service for syncing financial data (market, financial, news, ann) to PostgreSQL, Kafka and local storage",
    version="2.0.0",
)

# Registry of available connectors
CONNECTOR_REGISTRY: Dict[str, Type[BaseConnector]] = {
    "wind": WindConnector,
    "tushare": TushareConnector,
}

def get_connector() -> BaseConnector:
    """Get the configured connector based on settings."""
    settings = get_settings()
    connector_type = getattr(settings, "preferred_connector", "tushare").lower()
    connector_cls = CONNECTOR_REGISTRY.get(connector_type, TushareConnector)
    return connector_cls()

# In-memory tracking of the last status
_last_status: Dict[str, SyncStatus] = {}

async def run_pipeline_sync(task_type: str, incremental: bool = True, symbols: Optional[List[str]] = None):
    """Background task to run sync pipeline."""
    async with async_session_factory() as db:
        connector = get_connector()
        await connector.connect()
        pipeline = SyncPipeline(db, connector)
        try:
            if task_type == "stocks":
                await pipeline.sync_stocks()
            elif task_type == "klines":
                await pipeline.sync_daily_klines(symbols, incremental)
            elif task_type == "financials":
                if not symbols:
                    from sqlalchemy import select
                    from libs.db.models import Stock
                    result = await db.execute(select(Stock.symbol))
                    symbols = list(result.scalars().all())
                for symbol in symbols:
                    await pipeline.sync_financials(symbol, incremental)
            elif task_type == "news":
                await pipeline.sync_news(symbols[0] if symbols else None)
            elif task_type == "announcements":
                if not symbols:
                    from sqlalchemy import select
                    from libs.db.models import Stock
                    result = await db.execute(select(Stock.symbol))
                    symbols = list(result.scalars().all())
                for symbol in symbols:
                    await pipeline.sync_announcements(symbol)
            
            _last_status[task_type] = await connector.get_status()
            logger.info("pipeline_task_completed", task_type=task_type)
        except Exception as e:
            logger.error("pipeline_task_failed", task_type=task_type, error=str(e))
        finally:
            await connector.disconnect()

@app.get("/health", response_model=SyncStatus)
async def health_check():
    """Return the current health of the default connector."""
    connector = get_connector()
    await connector.connect()
    status = await connector.get_status()
    await connector.disconnect()
    return status

@app.post("/sync/stocks")
async def trigger_stock_sync(background_tasks: BackgroundTasks):
    """Trigger a sync of the A-share stock list."""
    background_tasks.add_task(run_pipeline_sync, "stocks")
    return {"message": "Stock list sync started"}

@app.post("/sync/klines")
async def trigger_kline_sync(background_tasks: BackgroundTasks, incremental: bool = True, symbols: Optional[List[str]] = None):
    """Trigger a sync of daily K-lines."""
    background_tasks.add_task(run_pipeline_sync, "klines", incremental, symbols)
    return {"message": "K-line sync started"}

@app.post("/sync/financials")
async def trigger_financial_sync(background_tasks: BackgroundTasks, incremental: bool = True, symbols: Optional[List[str]] = None):
    """Trigger a sync of financial reports."""
    background_tasks.add_task(run_pipeline_sync, "financials", incremental, symbols)
    return {"message": "Financial report sync started"}

@app.post("/sync/news")
async def trigger_news_sync(background_tasks: BackgroundTasks, symbol: Optional[str] = None):
    """Trigger a sync of news."""
    background_tasks.add_task(run_pipeline_sync, "news", symbols=[symbol] if symbol else None)
    return {"message": "News sync started"}

@app.post("/sync/announcements")
async def trigger_announcement_sync(background_tasks: BackgroundTasks, symbols: Optional[List[str]] = None):
    """Trigger a sync of announcements."""
    background_tasks.add_task(run_pipeline_sync, "announcements", symbols=symbols)
    return {"message": "Announcement sync started"}

@app.on_event("startup")
async def startup_event():
    """Perform startup tasks."""
    from libs.mq.kafka_client import get_kafka
    await get_kafka().start_producer()
    logger.info("pipeline_service_startup")

@app.on_event("shutdown")
async def shutdown_event():
    """Perform shutdown tasks."""
    from libs.mq.kafka_client import get_kafka
    await get_kafka().close()
    logger.info("pipeline_service_shutdown")
