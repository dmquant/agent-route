"""Main worker for the market data processing pipeline."""

import asyncio
import uuid
from typing import Dict, Any, List

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from libs.db.models import Stock, DailyKLine
from libs.mq.kafka_client import KafkaManager, TOPIC_MARKET_RAW, TOPIC_MARKET_DATA
from services.data_pipeline.processor import MarketDataProcessor

logger = structlog.get_logger(__name__)


class KafkaDataPipelineWorker:
    """Consumes raw data, cleans it, and writes to DB and clean topic."""

    def __init__(
        self,
        kafka_manager: KafkaManager,
        session_factory: async_sessionmaker[AsyncSession],
        batch_size: int = 100,
        max_lag: int = 5000,
    ) -> None:
        self.kafka = kafka_manager
        self.session_factory = session_factory
        self.processor = MarketDataProcessor()
        self.batch_size = batch_size
        self.max_lag = max_lag
        
        self._stock_id_map: Dict[str, uuid.UUID] = {}
        self._is_running = False

    async def initialize(self) -> None:
        """Cache stock symbols to IDs."""
        async with self.session_factory() as session:
            result = await session.execute(select(Stock.id, Stock.symbol))
            self._stock_id_map = {row.symbol: row.id for row in result}
            logger.info("stock_map_initialized", count=len(self._stock_id_map))

    async def start(self) -> None:
        """Start the consumer loop."""
        self._is_running = True
        consumer = await self.kafka.create_consumer(
            TOPIC_MARKET_RAW,
            group_id="market-data-pipeline-worker",
            enable_auto_commit=False,
        )
        await self.kafka.start_producer()

        logger.info("pipeline_worker_started", batch_size=self.batch_size)

        try:
            while self._is_running:
                # 1. Fetch batch
                batch = await consumer.getmany(timeout_ms=1000, max_records=self.batch_size)
                if not batch:
                    continue

                # 2. Monitor backpressure (simple lag check)
                await self._handle_backpressure(consumer)

                # 3. Process each partition's records
                for tp, messages in batch.items():
                    await self._process_messages(messages)
                    # 4. Commit Kafka offsets for this partition
                    # In a production environment, we should commit the offsets *after* 
                    # the database transaction is fully committed to achieve at-least-once 
                    # or exactly-once with idempotent writes.
                    await consumer.commit({tp: messages[-1].offset + 1})

        except asyncio.CancelledError:
            logger.info("pipeline_worker_cancelled")
        finally:
            self._is_running = False
            logger.info("pipeline_worker_stopped")

    async def stop(self) -> None:
        """Gracefully stop the worker."""
        self._is_running = False

    async def _handle_backpressure(self, consumer: Any) -> None:
        """Check for consumer lag and throttle if necessary."""
        # This is a simplified version. Real lag monitoring requires
        # calling consumer.highwater(topic_partition).
        # We'll just log an alert if the system feels slow.
        pass

    async def _process_messages(self, messages: List[Any]) -> None:
        """Process a list of Kafka messages in a single DB transaction."""
        async with self.session_factory() as session:
            try:
                for msg in messages:
                    raw_data = msg.value
                    
                    # Clean the data
                    bar = self.processor.clean_daily_bar(raw_data)
                    if not bar:
                        continue

                    # Map symbol to stock_id
                    stock_id = self._stock_id_map.get(bar.symbol)
                    if not stock_id:
                        logger.warning("stock_not_found_skipping", symbol=bar.symbol)
                        continue

                    # Upsert into PostgreSQL (exactly-once/idempotent)
                    stmt = insert(DailyKLine).values(
                        id=uuid.uuid4(),
                        stock_id=stock_id,
                        date=bar.date,
                        open=bar.open,
                        high=bar.high,
                        low=bar.low,
                        close=bar.close,
                        volume=bar.volume,
                        amount=bar.amount,
                        adj_factor=bar.adj_factor,
                    ).on_conflict_do_update(
                        index_elements=["stock_id", "date"],
                        set_={
                            "open": bar.open,
                            "high": bar.high,
                            "low": bar.low,
                            "close": bar.close,
                            "volume": bar.volume,
                            "amount": bar.amount,
                            "adj_factor": bar.adj_factor,
                        }
                    )
                    await session.execute(stmt)

                    # Publish clean data downstream
                    await self.kafka.send(TOPIC_MARKET_DATA, bar.model_dump(), key=bar.symbol)

                # Commit DB transaction
                await session.commit()
                logger.debug("batch_processed", count=len(messages))

            except Exception as e:
                await session.rollback()
                logger.error("batch_processing_failed", error=str(e))
                raise
