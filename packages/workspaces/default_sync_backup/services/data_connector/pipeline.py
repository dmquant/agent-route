"""Data collection pipeline for syncing financial data to DB, Kafka, and local file system."""

import asyncio
import json
import os
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Type, Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert, JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from libs.data.connector import BaseConnector
from libs.db.models import (
    DailyKLine, 
    Stock, 
    IncomeSheet, 
    BalanceSheet, 
    CashFlow
)
from libs.db.intelligence_models import News, Announcement, CrawlerStatus
from libs.mq.kafka_client import get_kafka, TOPIC_MARKET_DATA
from libs.schemas.market_data import DailyBar, RealtimeQuote

logger = structlog.get_logger(__name__)

class SyncPipeline:
    """Orchestrates data collection from a connector and stores it in the system."""

    def __init__(self, db: AsyncSession, connector: BaseConnector, storage_root: str = "data/raw"):
        self.db = db
        self.connector = connector
        self.kafka = get_kafka()
        self.storage_root = Path(storage_root)
        self.storage_root.mkdir(parents=True, exist_ok=True)

    async def sync_stocks(self) -> int:
        """Sync stock list to DB."""
        stocks = await self.connector.fetch_stock_list()
        if not stocks:
            return 0
            
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
                    "sector": stmt.excluded.sector,
                    "updated_at": func.now(),
                },
            )
            await self.db.execute(stmt)
        await self.db.commit()
        logger.info("synced_stock_list", count=len(stocks))
        return len(stocks)

    async def sync_daily_klines(self, symbols: Optional[List[str]] = None, incremental: bool = True):
        """Sync daily K-lines for stocks."""
        if not symbols:
            result = await self.db.execute(select(Stock.symbol))
            symbols = list(result.scalars().all())

        batch_size = 50
        for i in range(0, len(symbols), batch_size):
            batch_symbols = symbols[i:i+batch_size]
            
            # Determine date range for this batch
            end_date = date.today()
            if incremental:
                # Use the latest date from DB as start_date
                stmt = select(func.max(DailyKLine.date)).where(
                    DailyKLine.stock_id.in_(
                        select(Stock.id).where(Stock.symbol.in_(batch_symbols))
                    )
                )
                result = await self.db.execute(stmt)
                latest_date = result.scalar()
                start_date = (latest_date + timedelta(days=1)) if latest_date else (end_date - timedelta(days=365*2))
            else:
                start_date = end_date - timedelta(days=365*10)
            
            if start_date >= end_date:
                continue
                
            bars = await self.connector.fetch_daily_klines(batch_symbols, start_date, end_date)
            if not bars:
                continue

            # Save raw bars to filesystem
            await self._save_raw_data("klines", batch_symbols, bars)

            # Map symbols to stock_ids
            stock_id_map = await self._get_stock_id_map(batch_symbols)
            
            values = []
            for bar in bars:
                if bar.symbol in stock_id_map:
                    values.append({
                        "stock_id": stock_id_map[bar.symbol],
                        "date": bar.date,
                        "open": bar.open,
                        "high": bar.high,
                        "low": bar.low,
                        "close": bar.close,
                        "volume": bar.volume,
                        "amount": bar.amount,
                        "adj_factor": bar.adj_factor,
                    })

            if values:
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
                    }
                )
                await self.db.execute(stmt)
                
                # Publish to Kafka (only latest data usually)
                await self._publish_to_kafka(batch_symbols, values, stock_id_map)

            await self.db.commit()
            logger.info("synced_kline_batch", symbols=len(batch_symbols), bars=len(values))

    async def sync_financials(self, symbol: str, incremental: bool = True):
        """Sync financial reports for a stock."""
        # Determine date range
        end_date = date.today()
        start_date = end_date - timedelta(days=365) if incremental else end_date - timedelta(days=365*5)
        
        data = await self.connector.fetch_financials(symbol, start_date, end_date)
        if not data:
            return
            
        # Save raw data
        await self._save_raw_data("financials", [symbol], data)

        stock_id_map = await self._get_stock_id_map([symbol])
        if symbol not in stock_id_map:
            return
        stock_id = stock_id_map[symbol]
        
        for item in data:
            # We assume the item has 'ann_date', 'end_date', 'report_type'
            # Fallback to current date if missing
            ann_date = item.get("date", datetime.now())
            if isinstance(ann_date, datetime): ann_date = ann_date.date()
            
            stmt = insert(IncomeSheet).values(
                stock_id=stock_id,
                ann_date=ann_date,
                end_date=ann_date, # Fallback
                report_type="Q", # Fallback
                revenue=item.get("oper_rev"),
                n_income=item.get("net_profit_is"),
                metadata_json=self._sanitize_for_json(item)
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["stock_id", "end_date", "report_type"],
                set_={
                    "revenue": stmt.excluded.revenue,
                    "n_income": stmt.excluded.n_income,
                    "updated_at": func.now(),
                }
            )
            await self.db.execute(stmt)
        await self.db.commit()
        logger.info("synced_financials", symbol=symbol, count=len(data))

    async def sync_news(self, symbol: Optional[str] = None):
        """Sync news for a stock or market."""
        news_items = await self.connector.fetch_news(symbol)
        if not news_items:
            return
            
        # Save raw data
        await self._save_raw_data("news", [symbol or "market"], news_items)

        for item in news_items:
            stmt = insert(News).values(
                title=item["title"],
                content=item.get("content", ""),
                publish_time=item["publish_time"],
                source=item.get("source", "unknown"),
                url=item.get("url", f"internal://{datetime.now().timestamp()}"),
                related_stocks={"symbols": [symbol]} if symbol else {},
                metadata_json=self._sanitize_for_json(item)
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=["url"])
            await self.db.execute(stmt)
        await self.db.commit()
        logger.info("synced_news", symbol=symbol, count=len(news_items))

    async def sync_announcements(self, symbol: str):
        """Sync company announcements for a stock."""
        anns = await self.connector.fetch_announcements(symbol)
        if not anns:
            return
            
        # Save raw data
        await self._save_raw_data("announcements", [symbol], anns)

        for item in anns:
            stmt = insert(Announcement).values(
                title=item["title"],
                publish_time=item["publish_date"],
                stock_symbol=symbol,
                url=item.get("url", ""),
                ann_type=item.get("ann_type"),
                metadata_json=self._sanitize_for_json(item)
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=["url"])
            await self.db.execute(stmt)
        await self.db.commit()
        logger.info("synced_announcements", symbol=symbol, count=len(anns))

    async def _get_stock_id_map(self, symbols: List[str]) -> dict:
        stmt = select(Stock.id, Stock.symbol).where(Stock.symbol.in_(symbols))
        result = await self.db.execute(stmt)
        return {symbol: id for id, symbol in result.all()}

    async def _save_raw_data(self, category: str, symbols: List[str], data: Any):
        """Save raw data to local filesystem as JSON."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        folder = self.storage_root / category / date.today().isoformat()
        folder.mkdir(parents=True, exist_ok=True)
        
        filename = f"{'_'.join(symbols[:3])}_{timestamp}.json"
        if len(symbols) > 3:
            filename = f"batch_{len(symbols)}_{timestamp}.json"
            
        file_path = folder / filename
        
        # Handle Pydantic models and Decimals
        def default_serializer(obj):
            if hasattr(obj, "dict"):
                return obj.dict()
            if isinstance(obj, (Decimal, date, datetime)):
                return str(obj)
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, default=default_serializer, ensure_ascii=False, indent=2)

    async def _publish_to_kafka(self, symbols: List[str], values: List[dict], stock_id_map: dict):
        """Publish data to Kafka."""
        id_to_symbol = {id: symbol for symbol, id in stock_id_map.items()}
        for val in values:
            try:
                kafka_msg = {k: str(v) if isinstance(v, (Decimal, date, datetime)) else v for k, v in val.items()}
                symbol = id_to_symbol.get(val["stock_id"])
                if symbol:
                    kafka_msg["symbol"] = symbol
                    await self.kafka.send(TOPIC_MARKET_DATA, kafka_msg, key=symbol)
            except Exception as e:
                logger.warning("kafka_publish_failed", error=str(e))

    def _sanitize_for_json(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Decimals and dates to strings for JSONB storage."""
        sanitized = {}
        for k, v in data.items():
            if isinstance(v, (Decimal, date, datetime)):
                sanitized[k] = str(v)
            elif isinstance(v, dict):
                sanitized[k] = self._sanitize_for_json(v)
            elif isinstance(v, list):
                sanitized[k] = [self._sanitize_for_json(x) if isinstance(x, dict) else str(x) if isinstance(x, (Decimal, date, datetime)) else x for x in v]
            else:
                sanitized[k] = v
        return sanitized
