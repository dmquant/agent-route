"""Logic for syncing market data from Wind to PostgreSQL."""

import asyncio
from datetime import date, datetime, timedelta
from typing import List, Optional

import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert, JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from libs.db.models import DailyKLine, Stock
from libs.wind_client import WindClient
from libs.schemas.market_data import DailyBar, SyncStatus, StockInfo, RealtimeQuote

logger = structlog.get_logger(__name__)


class WindSyncManager:
    """Manages syncing of market data for all tracked stocks."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.client = WindClient()
        self.last_sync_time: Optional[datetime] = None
        self.total_stocks = 0
        self.synced_stocks = 0
        self.error_count = 0
        self.last_error: Optional[str] = None

    async def get_sync_status(self) -> SyncStatus:
        """Get the current sync status and health."""
        client_status = self.client.get_status()
        return SyncStatus(
            is_connected=client_status["is_connected"],
            last_sync_time=self.last_sync_time,
            total_stocks=self.total_stocks,
            synced_stocks=self.synced_stocks,
            error_count=self.error_count + client_status["error_count"],
            last_error=self.last_error,
            uptime_seconds=client_status["uptime_seconds"],
        )

    async def sync_stock_list(self):
        """Sync the current list of A-shares into the stocks table."""
        try:
            logger.info("syncing_stock_list_start")
            stocks: List[StockInfo] = await self.client.get_stock_list()
            
            # Use PostgreSQL UPSERT for stocks
            for info in stocks:
                stmt = insert(Stock).values(
                    symbol=info.symbol,
                    name=info.name,
                    exchange=info.exchange,
                    sector=info.sector,
                    metadata_json={"list_date": info.list_date.isoformat()} if info.list_date else {},
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["symbol"],
                    set_={
                        "name": stmt.excluded.name,
                        "exchange": stmt.excluded.exchange,
                        "updated_at": func.now(),
                    },
                )
                await self.db.execute(stmt)
            
            await self.db.commit()
            logger.info("syncing_stock_list_completed", count=len(stocks))
            return len(stocks)
        except Exception as e:
            logger.error("syncing_stock_list_failed", error=str(e))
            await self.db.rollback()
            raise

    async def sync_all_stocks(self, incremental: bool = True):
        """Sync market data for all stocks in the database."""
        try:
            # 1. Fetch all active stocks
            stmt = select(Stock)
            result = await self.db.execute(stmt)
            stocks = result.scalars().all()
            self.total_stocks = len(stocks)
            self.synced_stocks = 0

            if self.total_stocks == 0:
                logger.warning("no_stocks_found_in_db_skipping_sync")
                return

            logger.info("starting_market_data_sync", count=self.total_stocks, incremental=incremental)

            # 2. Group stocks by start_date to optimize API calls
            end_date = date.today()
            stocks_by_date = {}
            for stock in stocks:
                start_date = await self._get_start_date(stock, incremental)
                if start_date >= end_date:
                    self.synced_stocks += 1
                    continue
                
                if start_date not in stocks_by_date:
                    stocks_by_date[start_date] = []
                stocks_by_date[start_date].append(stock)

            # 3. Process each group
            for start_date, group in stocks_by_date.items():
                logger.info("syncing_date_group", start_date=start_date, count=len(group))
                # Process group in batches of symbols
                symbol_batch_size = 50  # Wind allows multiple symbols in one wsd call
                for i in range(0, len(group), symbol_batch_size):
                    batch = group[i : i + symbol_batch_size]
                    await self._sync_batch_of_stocks(batch, start_date, end_date)
                    self.synced_stocks += len(batch)
                    await self.db.commit()

            self.last_sync_time = datetime.now()
            logger.info("market_data_sync_completed", synced=self.synced_stocks)

        except Exception as e:
            self.error_count += 1
            self.last_error = str(e)
            logger.error("market_data_sync_failed", error=str(e))
            await self.db.rollback()
            raise

    async def sync_realtime_quotes(self, symbols: Optional[List[str]] = None):
        """Fetch and sync real-time snapshots for given or all stocks."""
        try:
            if symbols is None:
                stmt = select(Stock.symbol)
                result = await self.db.execute(stmt)
                symbols = list(result.scalars().all())

            if not symbols:
                return

            logger.info("syncing_realtime_quotes", count=len(symbols))
            
            # Batch symbols for wsq calls (Wind limit is usually around 100-200 symbols per call)
            batch_size = 100
            for i in range(0, len(symbols), batch_size):
                batch = symbols[i : i + batch_size]
                quotes: List[RealtimeQuote] = await self.client.get_realtime_quotes(batch)
                
                for quote in quotes:
                    stmt = insert(Stock).values(
                        symbol=quote.symbol,
                        name="", # Dummy for insert
                        exchange="", # Dummy for insert
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["symbol"],
                        set_={
                            "updated_at": func.now(),
                        },
                    )
                    await self.db.execute(stmt)
                
                logger.debug("realtime_batch_synced", count=len(quotes))

            self.last_sync_time = datetime.now()
        except Exception as e:
            self.error_count += 1
            self.last_error = str(e)
            logger.error("realtime_sync_failed", error=str(e))
            raise

    async def _sync_batch_of_stocks(self, stocks: List[Stock], start_date: date, end_date: date):
        """Sync a batch of stocks sharing the same date range."""
        try:
            symbols = [s.symbol for s in stocks]
            symbol_to_stock = {s.symbol: s for s in stocks}
            
            bars = await self.client.get_daily_bars(symbols, start_date, end_date)
            if not bars:
                return

            # Prepare data for bulk upsert
            values = [
                {
                    "stock_id": symbol_to_stock[bar.symbol].id,
                    "date": bar.date,
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume,
                    "amount": bar.amount,
                    "adj_factor": bar.adj_factor,
                }
                for bar in bars
            ]

            # Upsert using ON CONFLICT
            stmt = insert(DailyKLine).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["stock_id", "date"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                    "amount": stmt.excluded.amount,
                    "adj_factor": stmt.excluded.adj_factor,
                    "updated_at": func.now(),
                },
            )
            await self.db.execute(stmt)
            logger.debug("batch_synced", symbols=len(symbols), bars=len(bars))

        except Exception as e:
            logger.warning("batch_sync_failed", count=len(stocks), error=str(e))
            self.error_count += 1

    async def _get_start_date(self, stock: Stock, incremental: bool) -> date:
        """Calculate the start date for a stock's sync."""
        if not incremental:
            # Default to 10 years ago for full sync
            return date.today() - timedelta(days=365 * 10)
        
        # Find the latest date in DB for this stock
        stmt = select(func.max(DailyKLine.date)).where(DailyKLine.stock_id == stock.id)
        result = await self.db.execute(stmt)
        latest_date = result.scalar()
        
        if latest_date:
            return latest_date + timedelta(days=1)
        else:
            # Default to 5 years for new stocks
            return date.today() - timedelta(days=365 * 5)
