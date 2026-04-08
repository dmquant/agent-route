"""CLI tool for manual synchronization of intelligence data (news, announcements, etc.)."""

import asyncio
import argparse
import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog
from libs.logging_config import setup_logging
from services.data_connector.eastmoney_scraper import EastMoneyScraper

logger = structlog.get_logger(__name__)

async def run_sync(data_type: str, pages: int):
    """Run manual synchronization for East Money data."""
    scraper = EastMoneyScraper()
    try:
        if data_type == "news":
            logger.info("manual_sync_news", pages=pages)
            await scraper.run_sync_news(max_pages=pages)
        elif data_type == "announcements":
            logger.info("manual_sync_announcements", pages=pages)
            await scraper.run_sync_announcements(max_pages=pages)
        elif data_type == "reports":
            logger.info("manual_sync_reports", pages=pages)
            await scraper.run_sync_reports(max_pages=pages)
        elif data_type == "flows":
            logger.info("manual_sync_flows", pages=pages)
            await scraper.run_sync_fund_flows(max_pages=pages)
        elif data_type == "all":
            logger.info("manual_sync_all", pages=pages)
            await scraper.run_sync_news(max_pages=pages)
            await scraper.run_sync_announcements(max_pages=pages)
            await scraper.run_sync_reports(max_pages=pages)
            await scraper.run_sync_fund_flows(max_pages=pages)
        else:
            print(f"Unknown data type: {data_type}")
            return

        print(f"Manual sync for '{data_type}' completed.")
    except Exception as e:
        logger.error("manual_sync_failed", data_type=data_type, error=str(e))
        print(f"Manual sync for '{data_type}' failed: {e}")
    finally:
        await scraper.close()

def main():
    setup_logging(log_level="INFO")
    parser = argparse.ArgumentParser(description="East Money Data Sync Tool")
    parser.add_argument(
        "--type", 
        choices=["news", "announcements", "reports", "flows", "all"], 
        default="all",
        help="Data type to sync"
    )
    parser.add_argument(
        "--pages", 
        type=int, 
        default=5,
        help="Maximum number of pages to sync per category"
    )
    
    args = parser.parse_args()
    
    try:
        asyncio.run(run_sync(args.type, args.pages))
    except KeyboardInterrupt:
        print("\nSync interrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"Sync failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
