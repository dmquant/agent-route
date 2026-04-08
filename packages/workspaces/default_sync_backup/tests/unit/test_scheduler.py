"""Unit tests for the data collection scheduler."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from apscheduler.triggers.cron import CronTrigger

from services.scheduler.manager import SchedulerManager, trading_day_only
from services.scheduler.tasks import realtime_sync_task, daily_kline_sync_task

@pytest.fixture
def mock_scheduler_manager():
    with patch("services.scheduler.manager.SQLAlchemyJobStore", autospec=True):
        manager = SchedulerManager()
        # Mock the internal scheduler to avoid actual jobstore issues
        manager.scheduler = MagicMock()
        return manager

@pytest.mark.asyncio
async def test_scheduler_add_job(mock_scheduler_manager):
    """Test adding a job to the scheduler."""
    mock_func = AsyncMock()
    trigger = CronTrigger(hour=9, minute=25)
    
    mock_scheduler_manager.add_job(
        mock_func,
        trigger=trigger,
        id="test_job"
    )
    
    mock_scheduler_manager.scheduler.add_job.assert_called_once()
    args, kwargs = mock_scheduler_manager.scheduler.add_job.call_args
    assert kwargs["id"] == "test_job"
    assert kwargs["trigger"] == trigger

@pytest.mark.asyncio
@patch("services.scheduler.manager.is_trading_day")
async def test_trading_day_only_decorator(mock_is_trading_day):
    """Test the trading_day_only decorator."""
    mock_func = AsyncMock()
    decorated_func = trading_day_only(mock_func)
    
    # Case 1: Trading day
    mock_is_trading_day.return_value = True
    await decorated_func()
    mock_func.assert_called_once()
    mock_func.reset_mock()
    
    # Case 2: Non-trading day
    mock_is_trading_day.return_value = False
    await decorated_func()
    mock_func.assert_not_called()

@pytest.mark.asyncio
@patch("services.scheduler.tasks.WindSyncManager")
@patch("services.scheduler.tasks.async_session_factory")
@patch("services.scheduler.tasks.SchedulerManager")
@patch("services.scheduler.manager.is_trading_day", return_value=True)
async def test_realtime_sync_task(mock_is_trading_day, mock_scheduler_cls, 
                                mock_session_factory, mock_wind_manager_cls):
    """Test the realtime_sync_task execution."""
    # Setup mocks
    mock_scheduler = mock_scheduler_cls.return_value
    mock_scheduler.log_execution = AsyncMock()
    
    mock_db = AsyncMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_db
    
    mock_wind_manager = mock_wind_manager_cls.return_value
    mock_wind_manager.sync_realtime_quotes = AsyncMock()
    mock_wind_manager.get_sync_status = AsyncMock()
    mock_wind_manager.get_sync_status.return_value.synced_stocks = 50
    
    # Execute task
    await realtime_sync_task()
    
    # Verify calls
    mock_wind_manager.sync_realtime_quotes.assert_called_once()
    mock_scheduler.log_execution.assert_called_once()
    args, kwargs = mock_scheduler.log_execution.call_args
    assert kwargs["task_name"] == "realtime_sync"
    assert kwargs["status"] == "success"
    assert kwargs["collection_count"] == 50
