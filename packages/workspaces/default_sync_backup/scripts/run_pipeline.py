"""Script to run the market data pipeline worker."""

import asyncio
import signal

import structlog

from libs.db.session import async_session_factory
from libs.mq.kafka_client import get_kafka
from services.data_pipeline.worker import KafkaDataPipelineWorker

logger = structlog.get_logger(__name__)


async def main() -> None:
    """Entry point for the pipeline worker."""
    kafka = get_kafka()
    worker = KafkaDataPipelineWorker(
        kafka_manager=kafka,
        session_factory=async_session_factory,
        batch_size=200,
    )

    # Initialize worker (cache stock IDs)
    await worker.initialize()

    # Handle termination signals
    loop = asyncio.get_running_loop()

    def stop_worker() -> None:
        """Signal worker to stop."""
        logger.info("shutdown_signal_received")
        asyncio.create_task(worker.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_worker)

    try:
        # Start processing
        await worker.start()
    except Exception as e:
        logger.critical("pipeline_worker_fatal_error", error=str(e))
    finally:
        # Clean up
        await kafka.close()
        logger.info("pipeline_cleanup_complete")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
