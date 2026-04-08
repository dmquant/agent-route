"""Tushare Data Sync Service.

Main entry point to run the Tushare Pro data synchronization process.
"""

import asyncio
import argparse
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from libs.db.models import Stock
from libs.db.session import async_session_factory
from libs.data.tushare_connector import TushareConnector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("tushare_sync")

async def run_sync(full_sync: bool = False, symbols: list = None):
    """Run the synchronization process."""
    connector = TushareConnector()
    
    # 1. Sync stock list first to ensure all stocks exist in DB
    await connector.sync_stock_list()
    
    # 2. Get list of symbols to sync
    if not symbols:
        async with async_session_factory() as session:
            stmt = select(Stock.symbol)
            result = await session.execute(stmt)
            symbols = [row[0] for row in result.all()]
    
    logger.info(f"Starting sync for {len(symbols)} stocks.")
    
    # Define date ranges
    end_date = datetime.now().strftime("%Y%m%d")
    
    # For daily K-lines: 10 years
    kline_start = (datetime.now() - timedelta(days=365 * 10)).strftime("%Y%m%d")
    # For financials: 5 years
    fin_start = (datetime.now() - timedelta(days=365 * 5)).strftime("%Y%m%d")
    
    # If not full sync, maybe just sync last 30 days
    if not full_sync:
        kline_start = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")
        fin_start = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

    # 3. Sync data for each stock
    # Note: In a production environment, we might want to parallelize this 
    # but Tushare rate limits suggest a sequential or limited parallel approach.
    for i, symbol in enumerate(symbols):
        try:
            logger.info(f"[{i+1}/{len(symbols)}] Syncing {symbol}...")
            
            # Daily K-lines and Adj Factors
            await connector.sync_daily_klines(symbol, kline_start, end_date)
            
            # Financial Statements
            await connector.sync_financials(symbol, fin_start, end_date)
            
            # Dividends
            await connector.sync_dividends(symbol)
            
            # Small sleep to be nice to the API
            await asyncio.sleep(0.1)
            
        except Exception as e:
            logger.error(f"Failed to sync {symbol}: {e}")
            continue

    # 4. Sync Index Weights (e.g., HS300, ZZ500)
    indices = ["000300.SH", "000905.SH"]
    for index_code in indices:
        try:
            logger.info(f"Syncing index weights for {index_code}...")
            # Sync last 3 months of weights (weekly or monthly changes)
            for days_back in range(0, 90, 7):
                trade_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y%m%d")
                await connector.sync_index_weights(index_code, trade_date)
        except Exception as e:
            logger.error(f"Failed to sync index weights for {index_code}: {e}")

    logger.info("Synchronization process completed.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tushare Data Sync Service")
    parser.add_argument("--full", action="store_true", help="Run full sync (10 years K-lines, 5 years financials)")
    parser.add_argument("--symbols", type=str, help="Comma-separated list of symbols to sync")
    
    args = parser.parse_args()
    
    symbols_list = args.symbols.split(",") if args.symbols else None
    
    asyncio.run(run_sync(full_sync=args.full, symbols=symbols_list))
