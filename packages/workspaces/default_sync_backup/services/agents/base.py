"""Base class for all analyst agents."""

from abc import ABC, abstractmethod
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from libs.cache.redis_client import RedisClient
from libs.db.models import AnalystType, ResearchStatus, ResearchTask
from libs.mq.kafka_client import TOPIC_RESEARCH_RESULTS, KafkaManager

logger = structlog.get_logger(__name__)


class BaseAnalystAgent(ABC):
    """Abstract base for the six specialist analyst agents.

    Each agent receives a research task, performs analysis, and publishes
    results back through Kafka and persists to the database.
    """

    agent_type: AnalystType

    def __init__(self, db: AsyncSession, redis: RedisClient, kafka: KafkaManager) -> None:
        self.db = db
        self.redis = redis
        self.kafka = kafka
        self.log = logger.bind(agent=self.agent_type.value)

    async def execute(self, task: ResearchTask) -> dict[str, Any]:
        """Run the full analysis pipeline for a task.

        Updates task status, calls the concrete analyze() method,
        persists results, and publishes to Kafka.
        """
        self.log.info("task_started", task_id=str(task.id), stock_id=str(task.stock_id))
        task.status = ResearchStatus.RUNNING

        try:
            result = await self.analyze(task)
            task.status = ResearchStatus.COMPLETED
            task.result = result
            self.log.info("task_completed", task_id=str(task.id))

            # Cache the result
            cache_key = f"research:{task.stock_id}:{self.agent_type.value}"
            await self.redis.set_json(cache_key, result, ttl=3600)

            # Publish result event
            await self.kafka.send(
                TOPIC_RESEARCH_RESULTS,
                value={
                    "task_id": str(task.id),
                    "stock_id": str(task.stock_id),
                    "analyst_type": self.agent_type.value,
                    "status": "completed",
                    "result": result,
                },
                key=str(task.stock_id),
            )

            return result

        except Exception as e:
            task.status = ResearchStatus.FAILED
            task.error_message = str(e)
            self.log.error("task_failed", task_id=str(task.id), error=str(e))
            raise

    @abstractmethod
    async def analyze(self, task: ResearchTask) -> dict[str, Any]:
        """Perform the actual analysis. Implemented by each specialist agent."""
        ...
