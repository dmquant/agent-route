"""Wind API implementation of the BaseConnector."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional

import structlog

from libs.data.connector import BaseConnector
from libs.schemas.market_data import DailyBar, RealtimeQuote, StockInfo, SyncStatus
from libs.wind_client import WindClient

logger = structlog.get_logger(__name__)

class WindConnector(BaseConnector):
    """Connector for the Wind Financial Terminal API."""

    def __init__(self):
        self.client = WindClient()

    async def connect(self) -> bool:
        await self.client.start()
        return self.client.get_status()["is_connected"]

    async def disconnect(self) -> None:
        await self.client.stop()

    async def fetch_stock_list(self) -> List[StockInfo]:
        return await self.client.get_stock_list()

    async def fetch_daily_klines(
        self, 
        symbols: List[str], 
        start_date: date, 
        end_date: date
    ) -> List[DailyBar]:
        return await self.client.get_daily_bars(symbols, start_date, end_date)

    async def fetch_realtime_quotes(self, symbols: List[str]) -> List[RealtimeQuote]:
        return await self.client.get_realtime_quotes(symbols)

    async def fetch_financials(
        self, 
        symbol: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        # Default to last 3 years if not specified
        if not start_date:
            from datetime import timedelta
            start_date = date.today() - timedelta(days=365 * 3)
        if not end_date:
            end_date = date.today()
            
        return await self.client.get_financials(symbol, start_date, end_date)

    async def fetch_announcements(
        self, 
        symbol: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        if not start_date:
            from datetime import timedelta
            start_date = date.today() - timedelta(days=365)
        if not end_date:
            end_date = date.today()
            
        return await self.client.get_announcements(symbol, start_date, end_date)

    async def fetch_news(
        self, 
        symbol: Optional[str] = None, 
        category: str = "news",
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        # category is mapped to Wind news category if applicable
        return await self.client.get_news(symbol, limit=limit)

    async def get_status(self) -> SyncStatus:
        status = self.client.get_status()
        return SyncStatus(
            service_name="wind_connector",
            is_connected=status["is_connected"],
            error_count=status["error_count"],
            uptime_seconds=status["uptime_seconds"],
        )
