"""Tushare Pro Data Connector implementation of BaseConnector."""

import asyncio
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union
import uuid

import structlog
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from libs.data.connector import BaseConnector
from libs.tushare_client import TushareClient, TushareAPIError
from libs.schemas.market_data import (
    DailyBar, RealtimeQuote, StockInfo, SyncStatus,
    IncomeSheetSchema, BalanceSheetSchema, CashFlowSchema,
    AnnouncementSchema, NewsSchema
)

logger = structlog.get_logger(__name__)

class TushareConnector(BaseConnector):
    """Connector for Tushare Pro data synchronization."""

    def __init__(self, client: Optional[TushareClient] = None):
        self.client = client or TushareClient()
        self.last_sync_time: Optional[datetime] = None
        self.error_count = 0
        self.last_error: Optional[str] = None
        self.start_time = datetime.now()

    async def connect(self) -> bool:
        """Tushare uses HTTP API, no persistent connection needed."""
        return True

    async def disconnect(self) -> None:
        """Close the HTTP client."""
        await self.client.close()

    async def fetch_stock_list(self) -> List[StockInfo]:
        """Fetch the current list of available stocks from Tushare."""
        try:
            data = await self.client.request(
                "stock_basic", 
                params={"list_status": "L"}, 
                fields="ts_code,name,exchange,industry,list_date"
            )
            
            return [
                StockInfo(
                    symbol=item["ts_code"],
                    name=item["name"],
                    exchange=item["exchange"],
                    sector=item["industry"],
                    list_date=datetime.strptime(item["list_date"], "%Y%m%d").date() if item.get("list_date") else None
                )
                for item in data
            ]
        except Exception as e:
            self.error_count += 1
            self.last_error = str(e)
            logger.error("tushare_fetch_stock_list_failed", error=str(e))
            return []

    async def fetch_daily_klines(
        self, 
        symbols: List[str], 
        start_date: date, 
        end_date: date
    ) -> List[DailyBar]:
        """Fetch historical daily bars for the given symbols and date range."""
        all_bars = []
        # Tushare 'daily' API can take multiple symbols if they share the same date range,
        # but it's often better to query one by one or in small batches for stability.
        # Here we query one by one for simplicity and to avoid huge response payloads.
        for symbol in symbols:
            try:
                # Fetch daily k-lines
                data = await self.client.request(
                    "daily",
                    params={
                        "ts_code": symbol, 
                        "start_date": start_date.strftime("%Y%m%d"), 
                        "end_date": end_date.strftime("%Y%m%d")
                    },
                    fields="ts_code,trade_date,open,high,low,close,vol,amount"
                )
                
                # Fetch adjustment factors
                adj_data = await self.client.request(
                    "adj_factor",
                    params={
                        "ts_code": symbol, 
                        "start_date": start_date.strftime("%Y%m%d"), 
                        "end_date": end_date.strftime("%Y%m%d")
                    },
                    fields="trade_date,adj_factor"
                )
                adj_map = {item["trade_date"]: Decimal(str(item["adj_factor"])) for item in adj_data}

                for item in data:
                    all_bars.append(DailyBar(
                        symbol=item["ts_code"],
                        date=datetime.strptime(item["trade_date"], "%Y%m%d").date(),
                        open=Decimal(str(item["open"])),
                        high=Decimal(str(item["high"])),
                        low=Decimal(str(item["low"])),
                        close=Decimal(str(item["close"])),
                        volume=Decimal(str(item["vol"])),
                        amount=Decimal(str(item["amount"])),
                        adj_factor=adj_map.get(item["trade_date"], Decimal("1.0"))
                    ))
            except Exception as e:
                self.error_count += 1
                self.last_error = str(e)
                logger.warning("tushare_fetch_daily_klines_failed", symbol=symbol, error=str(e))
                
        self.last_sync_time = datetime.now()
        return all_bars

    async def fetch_realtime_quotes(self, symbols: List[str]) -> List[RealtimeQuote]:
        """Fetch current market snapshots for the given symbols (Mocked as Tushare has limited RT)."""
        # Tushare Pro doesn't really have high-frequency real-time quotes in the basic version.
        # We simulate it using the latest daily bar if available.
        today_str = date.today().strftime("%Y%m%d")
        all_quotes = []
        for symbol in symbols:
            try:
                data = await self.client.request(
                    "daily",
                    params={"ts_code": symbol, "start_date": today_str, "end_date": today_str},
                    fields="ts_code,trade_date,open,high,low,close,vol,amount"
                )
                if data:
                    item = data[0]
                    all_quotes.append(RealtimeQuote(
                        symbol=item["ts_code"],
                        date=datetime.strptime(item["trade_date"], "%Y%m%d").date(),
                        time=datetime.now().time(),
                        open=Decimal(str(item["open"])),
                        high=Decimal(str(item["high"])),
                        low=Decimal(str(item["low"])),
                        last=Decimal(str(item["close"])),
                        volume=Decimal(str(item["vol"])),
                        amount=Decimal(str(item["amount"])),
                        prev_close=Decimal(str(item["close"])) # Mock
                    ))
            except Exception as e:
                logger.warning("tushare_fetch_realtime_failed", symbol=symbol, error=str(e))
        return all_quotes

    async def fetch_financials(
        self, 
        symbol: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Fetch financial statement data (Income, Balance, CashFlow)."""
        params = {"ts_code": symbol}
        if start_date:
            params["start_date"] = start_date.strftime("%Y%m%d")
        if end_date:
            params["end_date"] = end_date.strftime("%Y%m%d")
            
        try:
            # For simplicity, we only return raw data from the Income statement as a sample
            data = await self.client.request("income", params=params)
            # Map fields to what pipeline expects
            for item in data:
                item["date"] = datetime.strptime(item["end_date"], "%Y%m%d")
                item["oper_rev"] = Decimal(str(item["revenue"])) if item.get("revenue") else None
                item["net_profit_is"] = Decimal(str(item["n_income"])) if item.get("n_income") else None
            return data
        except Exception as e:
            logger.error("tushare_fetch_financials_failed", symbol=symbol, error=str(e))
            return []

    async def fetch_announcements(
        self, 
        symbol: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Fetch company announcements and filings."""
        params = {"ts_code": symbol}
        if start_date:
            params["start_date"] = start_date.strftime("%Y%m%d")
        if end_date:
            params["end_date"] = end_date.strftime("%Y%m%d")
            
        try:
            # Tushare 'anns' API requires specific permissions, 
            # we use 'disclosure_date' as a fallback if available.
            data = await self.client.request("announcement", params=params)
            for item in data:
                item["publish_date"] = datetime.strptime(item["ann_date"], "%Y%m%d")
                item["title"] = item.get("title", "No Title")
            return data
        except Exception as e:
            logger.warning("tushare_fetch_announcements_failed", symbol=symbol, error=str(e))
            return []

    async def fetch_news(
        self, 
        symbol: Optional[str] = None, 
        category: str = "news",
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Fetch market news or stock-specific news."""
        try:
            # Tushare 'news' API
            data = await self.client.request(
                "news", 
                params={"src": "sina", "limit": limit},
                fields="title,content,datetime,source"
            )
            for item in data:
                item["publish_time"] = datetime.strptime(item["datetime"], "%Y-%m-%d %H:%M:%S")
            return data
        except Exception as e:
            logger.error("tushare_fetch_news_failed", error=str(e))
            return []

    async def get_status(self) -> SyncStatus:
        """Return the current health and connection status of the connector."""
        uptime = (datetime.now() - self.start_time).total_seconds()
        return SyncStatus(
            service_name="tushare_connector",
            is_connected=True,
            last_sync_time=self.last_sync_time,
            total_stocks=0, # Need actual count from DB or client
            synced_stocks=0,
            error_count=self.error_count,
            last_error=self.last_error,
            uptime_seconds=uptime
        )
