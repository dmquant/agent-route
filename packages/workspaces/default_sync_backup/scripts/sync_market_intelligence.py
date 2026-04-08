"""Script to run East Money market intelligence sync."""

import asyncio
import argparse
import structlog
from services.data_connector.eastmoney_scraper import EastMoneyScraper

logger = structlog.get_logger(__name__)

async def main():
    parser = argparse.ArgumentParser(description="East Money Market Intelligence Sync")
    parser.add_argument("--category", type=str, choices=["news", "announcements", "reports", "fund_flows", "all"], default="all", help="Category to sync")
    parser.add_argument("--pages", type=int, default=10, help="Max pages to sync")
    args = parser.parse_args()

    scraper = EastMoneyScraper()
    try:
        if args.category in ["news", "all"]:
            logger.info("Syncing news...")
            await scraper.run_sync_news(max_pages=args.pages)
            
        if args.category in ["announcements", "all"]:
            logger.info("Syncing announcements...")
            await scraper.run_sync_announcements(max_pages=args.pages)
            
        if args.category in ["reports", "all"]:
            logger.info("Syncing research reports...")
            await scraper.run_sync_reports(max_pages=args.pages)
            
        if args.category in ["fund_flows", "all"]:
            logger.info("Syncing fund flows...")
            await scraper.run_sync_fund_flows(max_pages=min(args.pages, 5))
            
    except Exception as e:
        logger.error("Sync failed", error=str(e))
    finally:
        await scraper.close()

if __name__ == "__main__":
    asyncio.run(main())
