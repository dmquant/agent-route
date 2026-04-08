"""Unit tests for the Tushare Pro connector."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import date
from decimal import Decimal
import uuid

from libs.data.tushare_connector import TushareConnector
from libs.tushare_client import TushareClient

@pytest.fixture
def mock_tushare_client():
    client = AsyncMock(spec=TushareClient)
    return client

@pytest.mark.asyncio
async def test_sync_stock_list(mock_tushare_client):
    # Setup mock data
    mock_tushare_client.request.return_value = [
        {
            "ts_code": "000001.SZ",
            "name": "平安银行",
            "exchange": "SZSE",
            "area": "深圳",
            "industry": "银行",
            "list_date": "19910403"
        }
    ]
    
    connector = TushareConnector(client=mock_tushare_client)
    
    # Mock the DB session
    with patch("libs.data.tushare_connector.async_session_factory") as mock_session_factory:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__.return_value = mock_session
        
        # Mock stock query (not found)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        await connector.sync_stock_list()
        
        # Verify
        mock_tushare_client.request.assert_called_with(
            "stock_basic", 
            params={"list_status": "L"}, 
            fields="ts_code,name,exchange,area,industry,list_date"
        )
        assert mock_session.add.called
        assert mock_session.commit.called

@pytest.mark.asyncio
async def test_sync_daily_klines(mock_tushare_client):
    # Setup mock data
    mock_tushare_client.request.side_effect = [
        # Daily data
        [
            {
                "ts_code": "000001.SZ",
                "trade_date": "20230101",
                "open": 10.0,
                "high": 11.0,
                "low": 9.5,
                "close": 10.5,
                "vol": 1000,
                "amount": 10000
            }
        ],
        # Adj factor
        [
            {
                "trade_date": "20230101",
                "adj_factor": 1.2
            }
        ]
    ]
    
    connector = TushareConnector(client=mock_tushare_client)
    
    with patch("libs.data.tushare_connector.async_session_factory") as mock_session_factory:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__.return_value = mock_session
        
        # Mock stock ID lookup followed by K-line lookup (not found)
        mock_stock_id_result = MagicMock()
        mock_stock_id_result.scalar_one_or_none.return_value = uuid.uuid4()
        
        mock_kline_result = MagicMock()
        mock_kline_result.scalar_one_or_none.return_value = None
        
        mock_session.execute.side_effect = [mock_stock_id_result, mock_kline_result]
        
        await connector.sync_daily_klines("000001.SZ", "20230101", "20230101")
        
        assert mock_session.add.called
        assert mock_session.commit.called
        
        # Check if correct K-line object was added
        added_obj = mock_session.add.call_args[0][0]
        assert added_obj.open == Decimal("10.0")
        assert added_obj.adj_factor == Decimal("1.2")
