"""Sentiment analyst agent - analyzes market sentiment and news."""

from typing import Any

from libs.db.models import AnalystType, ResearchTask
from services.agents.base import BaseAnalystAgent


class SentimentAnalystAgent(BaseAnalystAgent):
    """Analyzes news sentiment, social media trends, and market mood.

    Covers: news analysis, social media sentiment, analyst ratings, insider activity.
    """

    agent_type = AnalystType.SENTIMENT

    async def analyze(self, task: ResearchTask) -> dict[str, Any]:
        # TODO: Implement LLM-powered sentiment analysis in Phase 2
        self.log.info("sentiment_analysis_placeholder", prompt=task.prompt[:100])
        return {
            "analyst": self.agent_type.value,
            "status": "placeholder",
            "message": "Sentiment analysis will be implemented with LLM integration in Phase 2.",
        }
