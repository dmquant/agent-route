"""Kafka producer and consumer management."""

import json
from typing import Any

import structlog
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from configs.settings import get_settings

logger = structlog.get_logger(__name__)

# ── Topic definitions ───────────────────────────────────────────
TOPIC_MARKET_RAW = "market.raw"
TOPIC_MARKET_QUOTES_REALTIME = "market.quotes.realtime"
TOPIC_MARKET_KLINE_DAILY = "market.kline.daily"
TOPIC_NEWS_FINANCIAL = "news.financial"
TOPIC_AGENT_TASKS = "agent.tasks"
TOPIC_AGENT_RESULTS = "agent.results"

# Others
TOPIC_RESEARCH_TASKS = "research.tasks"
TOPIC_RESEARCH_RESULTS = "research.results"
TOPIC_MARKET_DATA = "market.data"
TOPIC_AGENT_EVENTS = "agent.events"

class KafkaManager:
    """Manages Kafka producer and consumer lifecycle."""

    def __init__(self) -> None:
        settings = get_settings()
        self._bootstrap_servers = settings.kafka_bootstrap_servers
        self._producer: AIOKafkaProducer | None = None
        self._consumers: dict[tuple[str, ...], AIOKafkaConsumer] = {}

    async def start_producer(self) -> None:
        """Initialize and start the Kafka producer."""
        if self._producer:
            return
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self._bootstrap_servers,
            value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
        )
        await self._producer.start()
        logger.info("kafka_producer_started", servers=self._bootstrap_servers)

    async def send(self, topic: str, value: Any, key: str | None = None) -> None:
        """Send a message to a Kafka topic.

        Supports Pydantic models by automatically converting them to dict.
        """
        if self._producer is None:
            raise RuntimeError("Kafka producer not started. Call start_producer() first.")

        # Convert Pydantic model to dict if needed
        if hasattr(value, "model_dump"):
            payload = value.model_dump()
        elif isinstance(value, dict):
            payload = value
        else:
            payload = value

        await self._producer.send_and_wait(topic, value=payload, key=key)
        logger.debug("kafka_message_sent", topic=topic, key=key)

    async def create_consumer(
        self,
        *topics: str,
        group_id: str = "stock-research-group",
        enable_auto_commit: bool = True,
        auto_offset_reset: str = "earliest",
    ) -> AIOKafkaConsumer:
        """Create and start a consumer for the given topics."""
        consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=self._bootstrap_servers,
            group_id=group_id,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset=auto_offset_reset,
            enable_auto_commit=enable_auto_commit,
        )
        await consumer.start()
        logger.info(
            "kafka_consumer_started",
            topics=topics,
            group_id=group_id,
            auto_commit=enable_auto_commit,
        )
        self._consumers[topics] = consumer
        return consumer

    async def close(self) -> None:
        """Shut down producer and all consumers."""
        if self._producer:
            await self._producer.stop()
            self._producer = None
            logger.info("kafka_producer_stopped")
        for topics, consumer in self._consumers.items():
            await consumer.stop()
            logger.info("kafka_consumer_stopped", topics=topics)
        self._consumers.clear()


_instance: KafkaManager | None = None


def get_kafka() -> KafkaManager:
    """Return a singleton KafkaManager instance."""
    global _instance
    if _instance is None:
        _instance = KafkaManager()
    return _instance
