"""APScheduler manager for data collection tasks."""

import asyncio
from datetime import datetime, timezone
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from configs.settings import get_settings
from libs.db.session import async_session_factory
from libs.db.models import SchedulerLog
from libs.trading_calendar import is_trading_day

logger = structlog.get_logger(__name__)
settings = get_settings()

class SchedulerManager:
    """Manages APScheduler for the platform."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SchedulerManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
            
        jobstores = {
            'default': SQLAlchemyJobStore(url=settings.database_url_sync)
        }
        self.scheduler = AsyncIOScheduler(jobstores=jobstores)
        self._initialized = True
        logger.info("scheduler_manager_initialized")

    async def start(self):
        """Start the scheduler."""
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("scheduler_started")

    async def shutdown(self):
        """Shutdown the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("scheduler_shutdown")

    def add_job(self, func, trigger, id, name=None, replace_existing=True, **kwargs):
        """Add a job to the scheduler."""
        return self.scheduler.add_job(
            func,
            trigger=trigger,
            id=id,
            name=name or id,
            replace_existing=replace_existing,
            **kwargs
        )

    async def log_execution(self, task_name: str, status: str, started_at: datetime, 
                           collection_count: int = 0, error_message: str = None, 
                           metadata: dict = None):
        """Log a task execution to the database."""
        completed_at = datetime.now(timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        
        async with async_session_factory() as session:
            log_entry = SchedulerLog(
                task_name=task_name,
                status=status,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
                collection_count=collection_count,
                error_message=error_message,
                metadata_json=metadata
            )
            session.add(log_entry)
            await session.commit()
            logger.info("execution_logged", task=task_name, status=status, duration=duration_ms)

def trading_day_only(func):
    """Decorator to skip execution on non-trading days."""
    async def wrapper(*args, **kwargs):
        if not is_trading_day():
            logger.info("skip_task_non_trading_day", task=func.__name__)
            return
        return await func(*args, **kwargs)
    wrapper.__name__ = func.__name__
    return wrapper
