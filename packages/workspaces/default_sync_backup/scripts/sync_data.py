"""CLI script to manually trigger data synchronization."""

import asyncio
import argparse
import sys
from typing import List, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from libs.db.session import async_session_factory
from services.data_connector.main import get_connector
from services.data_connector.pipeline import SyncPipeline

logger = structlog.get_logger(__name__)

async def run_sync(
    data_types: List[str], 
    symbols: Optional[List[str]] = None, 
    incremental: bool = True
):
    """Run synchronization for selected data types and symbols."""
    async with async_session_factory() as db:
        connector = get_connector()
        await connector.connect()
        pipeline = SyncPipeline(db, connector)
        
        try:
            if "stocks" in data_types:
                logger.info("syncing_stocks")
                await pipeline.sync_stocks()
            
            if "klines" in data_types:
                logger.info("syncing_klines", symbols=symbols, incremental=incremental)
                await pipeline.sync_daily_klines(symbols, incremental)
                
            if "financials" in data_types:
                if not symbols:
                    from sqlalchemy import select
                    from libs.db.models import Stock
                    result = await db.execute(select(Stock.symbol))
                    symbols = list(result.scalars().all())
                for symbol in symbols:
                    logger.info("syncing_financials", symbol=symbol)
                    await pipeline.sync_financials(symbol, incremental)
                    
            if "news" in data_types:
                logger.info("syncing_news", symbols=symbols)
                if symbols:
                    for symbol in symbols:
                        await pipeline.sync_news(symbol)
                else:
                    await pipeline.sync_news()
                    
            if "announcements" in data_types:
                if not symbols:
                    from sqlalchemy import select
                    from libs.db.models import Stock
                    result = await db.execute(select(Stock.symbol))
                    symbols = list(result.scalars().all())
                for symbol in symbols:
                    logger.info("syncing_announcements", symbol=symbol)
                    await pipeline.sync_announcements(symbol)
                    
            logger.info("manual_sync_completed")
        except Exception as e:
            logger.error("manual_sync_failed", error=str(e))
        finally:
            await connector.disconnect()

def main():
    parser = argparse.ArgumentParser(description="Manual data sync CLI")
    parser.add_argument(
        "--type", 
        nargs="+", 
        choices=["stocks", "klines", "financials", "news", "announcements"],
        required=True,
        help="Data types to sync"
    )
    parser.add_argument("--symbols", nargs="+", help="Stock symbols (optional)")
    parser.add_argument("--full", action="store_true", help="Perform full sync instead of incremental")
    
    args = parser.parse_args()
    
    asyncio.run(run_sync(args.type, args.symbols, not args.full))

if __name__ == "__main__":
    main()
