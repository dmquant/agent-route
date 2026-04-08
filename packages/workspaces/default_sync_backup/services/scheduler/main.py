"""Main entry point for the scheduler service."""

import asyncio
import structlog
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from libs.db.session import async_session_factory, get_db
from libs.db.models import SchedulerLog
from services.scheduler.manager import SchedulerManager
from services.scheduler.tasks import (
    realtime_sync_task,
    daily_kline_sync_task,
    news_sync_task,
    weekly_financials_task
)

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="Data Collection Scheduler",
    description="Service for managing periodic data collection tasks",
    version="1.0.0",
)

scheduler_manager = SchedulerManager()

@app.on_event("startup")
async def startup_event():
    """Startup tasks: Register jobs and start scheduler."""
    # 1. Real-time Market Data: 9:25 AM (Mon-Fri)
    scheduler_manager.add_job(
        realtime_sync_task,
        CronTrigger(day_of_week='mon-fri', hour=9, minute=25),
        id="realtime_sync",
        name="Real-time Market Data Sync"
    )
    
    # 2. Daily K-lines and Capital Flow: 3:15 PM (Mon-Fri)
    scheduler_manager.add_job(
        daily_kline_sync_task,
        CronTrigger(day_of_week='mon-fri', hour=15, minute=15),
        id="daily_kline_sync",
        name="Daily K-line and Capital Flow Sync"
    )
    
    # 3. Financial News and Announcements: 8:00 PM (Daily)
    scheduler_manager.add_job(
        news_sync_task,
        CronTrigger(hour=20, minute=0),
        id="news_sync",
        name="Financial News and Announcements Sync"
    )
    
    # 4. Weekly Financial Data: Sunday 10:00 AM
    scheduler_manager.add_job(
        weekly_financials_task,
        CronTrigger(day_of_week='sun', hour=10, minute=0),
        id="weekly_financials",
        name="Weekly Financial Data Sync"
    )
    
    await scheduler_manager.start()
    logger.info("scheduler_service_started")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown tasks: Stop scheduler."""
    await scheduler_manager.shutdown()
    logger.info("scheduler_service_stopped")


@app.get("/status")
async def get_scheduler_status():
    """Return the current status of the scheduler and its jobs."""
    jobs = []
    for job in scheduler_manager.scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": str(job.next_run_time),
            "trigger": str(job.trigger)
        })
    
    return {
        "running": scheduler_manager.scheduler.running,
        "jobs": jobs
    }


@app.post("/jobs/{job_id}/trigger")
async def trigger_job(job_id: str, background_tasks: BackgroundTasks):
    """Manually trigger a job."""
    job = scheduler_manager.scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Run the job function in the background
    background_tasks.add_task(job.func)
    return {"message": f"Job {job_id} triggered manually"}


@app.get("/logs")
async def get_scheduler_logs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Retrieve recent scheduler execution logs."""
    result = await db.execute(
        select(SchedulerLog)
        .order_by(SchedulerLog.started_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return logs
