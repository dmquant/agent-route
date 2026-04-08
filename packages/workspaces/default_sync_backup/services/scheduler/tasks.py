"""Scheduler tasks for data collection using the unified SyncPipeline."""

from datetime import datetime, timezone
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from libs.db.session import async_session_factory
from services.data_connector.main import get_connector
from services.data_connector.pipeline import SyncPipeline
from services.scheduler.manager import SchedulerManager, trading_day_only

logger = structlog.get_logger(__name__)

async def _run_pipeline_task(task_name: str, task_fn):
    """Helper to run a pipeline task and log results."""
    started_at = datetime.now(timezone.utc)
    scheduler = SchedulerManager()
    
    try:
        async with async_session_factory() as db:
            connector = get_connector()
            await connector.connect()
            pipeline = SyncPipeline(db, connector)
            
            # Execute the specific task function
            result_count = await task_fn(pipeline)
            
            await scheduler.log_execution(
                task_name=task_name,
                status="success",
                started_at=started_at,
                collection_count=result_count or 0
            )
            await connector.disconnect()
    except Exception as e:
        logger.error(f"{task_name}_failed", error=str(e))
        await scheduler.log_execution(
            task_name=task_name,
            status="failed",
            started_at=started_at,
            error_message=str(e)
        )

@trading_day_only
async def daily_kline_sync_task():
    """Sync daily K-lines at 3:15 PM."""
    async def task(pipeline):
        await pipeline.sync_stocks()
        await pipeline.sync_daily_klines(incremental=True)
        return 5000 # Approximate
        
    await _run_pipeline_task("daily_kline_sync", task)

async def news_sync_task():
    """Sync financial news and announcements at 8:00 PM."""
    async def task(pipeline):
        await pipeline.sync_news()
        # For announcements, we might only sync for a subset or all
        # For now, let's say we sync for top 100 stocks as a sample
        from sqlalchemy import select
        from libs.db.models import Stock
        async with async_session_factory() as db:
            result = await db.execute(select(Stock.symbol).limit(100))
            symbols = list(result.scalars().all())
        
        for symbol in symbols:
            await pipeline.sync_announcements(symbol)
        return len(symbols)
        
    await _run_pipeline_task("news_sync", task)

async def weekly_financials_task():
    """Sync weekly financial data on Sunday 10:00 AM."""
    async def task(pipeline):
        from sqlalchemy import select
        from libs.db.models import Stock
        async with async_session_factory() as db:
            result = await db.execute(select(Stock.symbol))
            symbols = list(result.scalars().all())
            
        for symbol in symbols:
            await pipeline.sync_financials(symbol, incremental=True)
        return len(symbols)
        
    await _run_pipeline_task("weekly_financials", task)
