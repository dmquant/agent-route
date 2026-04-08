"""CLI tool to trigger market data sync manually."""

import asyncio
import argparse
import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from libs.db.session import async_session_factory
from libs.logging_config import setup_logging
from services.data_connector.wind_connector import WindSyncManager

logger = structlog.get_logger(__name__)

async def run_sync(mode: str):
    """Run the requested sync operation."""
    async with async_session_factory() as db:
        manager = WindSyncManager(db)
        
        if mode == "stocks":
            logger.info("syncing_stocks_list")
            count = await manager.sync_stock_list()
            print(f"Successfully synced {count} stocks.")
            
        elif mode == "incremental":
            logger.info("syncing_market_data_incremental")
            await manager.sync_all_stocks(incremental=True)
            print("Incremental market data sync completed.")
            
        elif mode == "full":
            logger.info("syncing_market_data_full")
            await manager.sync_all_stocks(incremental=False)
            print("Full market data sync completed.")
            
        elif mode == "realtime":
            logger.info("syncing_market_data_realtime")
            await manager.sync_realtime_quotes()
            print("Real-time quote sync completed.")

def main():
    setup_logging()
    parser = argparse.ArgumentParser(description="AI Stock Research Market Data Sync Tool")
    parser.add_argument(
        "mode", 
        choices=["stocks", "incremental", "full", "realtime"], 
        help="Sync mode: 'stocks' for metadata, 'incremental' for new K-lines, 'full' for history, 'realtime' for quotes"
    )
    
    args = parser.parse_args()
    
    try:
        asyncio.run(run_sync(args.mode))
    except KeyboardInterrupt:
        print("\nSync interrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"Sync failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
