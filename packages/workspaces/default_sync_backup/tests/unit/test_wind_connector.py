"""Unit tests for the Wind data connector."""

import asyncio
import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from libs.db.models import Stock
from libs.schemas.market_data import DailyBar, RealtimeQuote, StockInfo
from libs.wind_client import WindClient, WindRes
from services.data_connector.wind_connector import WindSyncManager


@pytest.fixture(autouse=True)
def reset_wind_client():
    """Reset the WindClient singleton before each test."""
    WindClient._instance = None
    yield
    WindClient._instance = None


@pytest.fixture
def mock_db_session():
    """Fixture for mocked DB session."""
    session = AsyncMock(spec=AsyncSession)
    return session


@pytest.fixture
def mock_wind_sdk():
    """Fixture for mocked WindPy SDK."""
    mock_w = MagicMock()
    mock_w.isconnected.return_value = True
    mock_w.start.return_value = MagicMock(ErrorCode=0)
    # Using patch.dict to mock the module
    with patch.dict("sys.modules", {"WindPy": MagicMock(w=mock_w)}):
        yield mock_w


@pytest.mark.asyncio
async def test_get_start_date_new_stock(mock_db_session):
    """Test start date calculation for a new stock."""
    manager = WindSyncManager(mock_db_session)
    stock = Stock(id=uuid.uuid4(), symbol="000001.SZ")
    
    # Mock DB return None for max(date)
    mock_result = MagicMock()
    mock_result.scalar.return_value = None
    mock_db_session.execute.return_value = mock_result
    
    start_date = await manager._get_start_date(stock, incremental=True)
    
    # Should default to 5 years ago
    assert (date.today() - start_date).days >= 365 * 4


@pytest.mark.asyncio
async def test_get_start_date_existing_stock(mock_db_session):
    """Test start date calculation for an existing stock."""
    manager = WindSyncManager(mock_db_session)
    stock = Stock(id=uuid.uuid4(), symbol="000001.SZ")
    latest_date = date(2023, 1, 1)
    
    # Mock DB return latest_date
    mock_result = MagicMock()
    mock_result.scalar.return_value = latest_date
    mock_db_session.execute.return_value = mock_result
    
    start_date = await manager._get_start_date(stock, incremental=True)
    
    assert start_date == date(2023, 1, 2)


@pytest.mark.asyncio
async def test_wind_client_get_daily_bars(mock_wind_sdk):
    """Test fetching daily bars from Wind client."""
    client = WindClient()
    
    # Mock Wind response
    mock_res = MagicMock(spec=WindRes)
    mock_res.ErrorCode = 0
    mock_res.Codes = ["000001.SZ"]
    mock_res.Times = [datetime(2023, 1, 1)]
    mock_res.Data = [
        [10.0], [11.0], [9.0], [10.5], [1000], [10000], [1.0]
    ]
    mock_wind_sdk.wsd.return_value = mock_res
    
    bars = await client.get_daily_bars(["000001.SZ"], date(2023, 1, 1), date(2023, 1, 1))
    
    assert len(bars) == 1
    assert bars[0].symbol == "000001.SZ"
    assert bars[0].close == Decimal("10.5")


@pytest.mark.asyncio
async def test_wind_client_get_stock_list(mock_wind_sdk):
    """Test fetching stock list from Wind client."""
    client = WindClient()
    
    # Mock Wind response for wset
    mock_res = MagicMock(spec=WindRes)
    mock_res.ErrorCode = 0
    # wset returns data as columns in a list
    mock_res.Data = [
        [date(2023, 1, 1)], # Date
        ["000001.SZ"],      # Wind Code
        ["平安银行"]         # Sec Name
    ]
    mock_wind_sdk.wset.return_value = mock_res
    
    stocks = await client.get_stock_list()
    
    assert len(stocks) == 1
    assert stocks[0].symbol == "000001.SZ"
    assert stocks[0].name == "平安银行"
    assert stocks[0].exchange == "SZSE"


@pytest.mark.asyncio
async def test_wind_client_get_realtime_quotes(mock_wind_sdk):
    """Test fetching real-time quotes from Wind client."""
    client = WindClient()
    
    # Mock Wind response for wsq
    mock_res = MagicMock(spec=WindRes)
    mock_res.ErrorCode = 0
    mock_res.Codes = ["000001.SZ"]
    # Fields: rt_date, rt_time, rt_open, rt_high, rt_low, rt_last, rt_vol, rt_amt, rt_pre_close
    mock_res.Data = [
        [datetime(2023, 1, 1)], # Date
        [datetime(2023, 1, 1, 10, 30)], # Time
        [10.0], [11.0], [9.5], [10.5], [1000], [10000], [9.8]
    ]
    mock_wind_sdk.wsq.return_value = mock_res
    
    quotes = await client.get_realtime_quotes(["000001.SZ"])
    
    assert len(quotes) == 1
    assert quotes[0].symbol == "000001.SZ"
    assert quotes[0].last == Decimal("10.5")
    assert quotes[0].prev_close == Decimal("9.8")


@pytest.mark.asyncio
async def test_sync_manager_realtime_sync(mock_db_session, mock_wind_sdk):
    """Test sync manager real-time sync method."""
    manager = WindSyncManager(mock_db_session)
    
    # Mock symbols in DB
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = ["000001.SZ"]
    mock_db_session.execute.return_value = mock_result
    
    # Mock client response
    mock_quotes = [
        RealtimeQuote(
            symbol="000001.SZ", 
            date=date(2023, 1, 1), 
            time=datetime.now().time(), 
            open=Decimal("10"), high=Decimal("11"), low=Decimal("9"), last=Decimal("10.5"), 
            volume=Decimal("100"), amount=Decimal("1000"), prev_close=Decimal("10")
        )
    ]
    
    with patch.object(WindClient, "get_realtime_quotes", return_value=mock_quotes):
        await manager.sync_realtime_quotes()
        
        # Verify it fetched symbols
        assert mock_db_session.execute.called
        # Note: We didn't implement actual DB update for realtime yet (just placeholders)
        # but the method should complete without error.


@pytest.mark.asyncio
async def test_sync_manager_status(mock_db_session, mock_wind_sdk):
    """Test sync manager status reporting."""
    manager = WindSyncManager(mock_db_session)
    # Start the client to ensure it's "connected" in the status report
    await manager.client.start()
    
    status = await manager.get_sync_status()
    
    assert status.service_name == "wind_connector"
    assert status.is_connected is True
    assert status.error_count == 0


@pytest.mark.asyncio
async def test_sync_stock_list(mock_db_session, mock_wind_sdk):
    """Test syncing stock list to DB."""
    manager = WindSyncManager(mock_db_session)
    
    # Mock client response
    mock_stocks = [
        StockInfo(symbol="000001.SZ", name="平安银行", exchange="SZSE"),
        StockInfo(symbol="600000.SH", name="浦发银行", exchange="SSE"),
    ]
    
    with patch.object(WindClient, "get_stock_list", return_value=mock_stocks):
        count = await manager.sync_stock_list()
        
        assert count == 2
        # Verify execute was called for each stock (UPSERT)
        assert mock_db_session.execute.call_count == 2
        assert mock_db_session.commit.called


@pytest.mark.asyncio
async def test_sync_all_stocks_grouping(mock_db_session, mock_wind_sdk):
    """Test that sync_all_stocks groups stocks by start_date."""
    manager = WindSyncManager(mock_db_session)
    
    # Mock two stocks with different start dates
    stock1 = Stock(id=uuid.uuid4(), symbol="000001.SZ")
    stock2 = Stock(id=uuid.uuid4(), symbol="600000.SH")
    
    mock_result_stocks = MagicMock()
    mock_result_stocks.scalars.return_value.all.return_value = [stock1, stock2]
    
    # We need to mock _get_start_date to return different dates
    # Since it's an internal method, we can mock it on the manager instance
    with patch.object(manager, "_get_start_date") as mock_get_date:
        mock_get_date.side_effect = [date(2023, 1, 1), date(2023, 1, 2)]
        
        # Mock execute for the initial select(Stock)
        mock_db_session.execute.return_value = mock_result_stocks
        
        # Mock _sync_batch_of_stocks to avoid actual client calls
        with patch.object(manager, "_sync_batch_of_stocks", new_callable=AsyncMock) as mock_sync_batch:
            await manager.sync_all_stocks(incremental=True)
            
            # Should have called _sync_batch_of_stocks twice, once for each date group
            assert mock_sync_batch.call_count == 2
            # Verify the arguments for the first call
            # call_args is (args, kwargs)
            args1 = mock_sync_batch.call_args_list[0][0]
            assert args1[0] == [stock1]
            assert args1[1] == date(2023, 1, 1)


@pytest.mark.asyncio
async def test_sync_batch_of_stocks(mock_db_session, mock_wind_sdk):
    """Test syncing a batch of symbols at once."""
    manager = WindSyncManager(mock_db_session)
    stock1 = Stock(id=uuid.uuid4(), symbol="000001.SZ")
    stock2 = Stock(id=uuid.uuid4(), symbol="600000.SH")
    
    mock_bars = [
        DailyBar(symbol="000001.SZ", date=date(2023, 1, 1), open=Decimal("10"), high=Decimal("11"), low=Decimal("9"), close=Decimal("10.5"), volume=Decimal("100"), amount=Decimal("1000"), adj_factor=Decimal("1.0")),
        DailyBar(symbol="600000.SH", date=date(2023, 1, 1), open=Decimal("20"), high=Decimal("21"), low=Decimal("19"), close=Decimal("20.5"), volume=Decimal("200"), amount=Decimal("4000"), adj_factor=Decimal("1.0")),
    ]
    
    with patch.object(WindClient, "get_daily_bars", return_value=mock_bars):
        await manager._sync_batch_of_stocks([stock1, stock2], date(2023, 1, 1), date(2023, 1, 1))
        
        # Verify execute was called (UPSERT for the whole batch)
        assert mock_db_session.execute.called
