"""Unified interface for all financial data source connectors."""

from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Dict, List, Optional, Any

from libs.schemas.market_data import (
    DailyBar,
    RealtimeQuote,
    StockInfo,
    SyncStatus,
)

class BaseConnector(ABC):
    """Abstract base class for data source connectors (e.g., Wind, AkShare, Tushare)."""

    @abstractmethod
    async def connect(self) -> bool:
        """Initialize connection to the data source."""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Close connection to the data source."""
        pass

    @abstractmethod
    async def fetch_stock_list(self) -> List[StockInfo]:
        """Fetch the current list of available stocks."""
        pass

    @abstractmethod
    async def fetch_daily_klines(
        self, 
        symbols: List[str], 
        start_date: date, 
        end_date: date
    ) -> List[DailyBar]:
        """Fetch historical daily bars for the given symbols and date range."""
        pass

    @abstractmethod
    async def fetch_realtime_quotes(self, symbols: List[str]) -> List[RealtimeQuote]:
        """Fetch current market snapshots for the given symbols."""
        pass

    @abstractmethod
    async def fetch_financials(
        self, 
        symbol: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Fetch financial statement data (Income, Balance, CashFlow)."""
        pass

    @abstractmethod
    async def fetch_announcements(
        self, 
        symbol: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Fetch company announcements and filings."""
        pass

    @abstractmethod
    async def fetch_news(
        self, 
        symbol: Optional[str] = None, 
        category: str = "news",
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Fetch market news or stock-specific news."""
        pass

    @abstractmethod
    async def get_status(self) -> SyncStatus:
        """Return the current health and connection status of the connector."""
        pass
