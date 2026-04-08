"""Kafka message queue layer."""

from libs.mq.kafka_client import (
    TOPIC_AGENT_RESULTS,
    TOPIC_AGENT_TASKS,
    TOPIC_MARKET_KLINE_DAILY,
    TOPIC_MARKET_QUOTES_REALTIME,
    TOPIC_NEWS_FINANCIAL,
    KafkaManager,
    get_kafka,
)

__all__ = [
    "KafkaManager",
    "get_kafka",
    "TOPIC_MARKET_QUOTES_REALTIME",
    "TOPIC_MARKET_KLINE_DAILY",
    "TOPIC_NEWS_FINANCIAL",
    "TOPIC_AGENT_TASKS",
    "TOPIC_AGENT_RESULTS",
]
