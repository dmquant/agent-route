"""Main entry point for the East Money scraper service."""

import asyncio
import signal
import structlog
from datetime import datetime, timezone

from libs.mq.kafka_client import get_kafka
from services.data_connector.eastmoney_scraper import EastMoneyScraper

logger = structlog.get_logger(__name__)

class EastMoneyService:
    """Service to run East Money scraper periodically."""
    
    def __init__(self, interval_seconds: int = 1800): # Default 30 minutes
        self.interval_seconds = interval_seconds
        self.scraper = EastMoneyScraper()
        self.is_running = False
        self.kafka = get_kafka()

    async def run_once(self):
        """Execute a single sync cycle."""
        logger.info("sync_cycle_start")
        try:
            # Run all sync tasks in sequence to respect rate limits
            await self.scraper.run_sync_news()
            await self.scraper.run_sync_announcements()
            await self.scraper.run_sync_reports()
            await self.scraper.run_sync_fund_flows()
            logger.info("sync_cycle_completed")
        except Exception as e:
            logger.error("sync_cycle_failed", error=str(e))

    async def start(self):
        """Start the periodic sync loop."""
        self.is_running = True
        
        # Ensure Kafka producer is started
        try:
            await self.kafka.start_producer()
        except Exception as e:
            logger.warning("kafka_start_failed_running_without_kafka", error=str(e))
            
        logger.info("eastmoney_service_started", interval=self.interval_seconds)
        
        while self.is_running:
            start_time = datetime.now(timezone.utc)
            await self.run_once()
            
            # Calculate wait time
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            wait_time = max(0, self.interval_seconds - elapsed)
            
            if self.is_running:
                logger.info("waiting_for_next_cycle", seconds=wait_time)
                try:
                    await asyncio.sleep(wait_time)
                except asyncio.CancelledError:
                    break

    def stop(self):
        """Stop the service."""
        self.is_running = False
        logger.info("eastmoney_service_stopping")

async def main():
    """Service main function."""
    service = EastMoneyService()
    
    # Handle termination signals
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, service.stop)
        
    try:
        await service.start()
    finally:
        await service.scraper.close()
        await service.kafka.close()

if __name__ == "__main__":
    asyncio.run(main())
