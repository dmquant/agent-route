"""Fundamental analyst agent - analyzes financial statements and valuations."""

from typing import Any

from libs.db.models import AnalystType, ResearchTask
from services.agents.base import BaseAnalystAgent


class FundamentalAnalystAgent(BaseAnalystAgent):
    """Analyzes company financials, earnings, and intrinsic value.

    Covers: P/E, P/B, DCF, revenue growth, margins, balance sheet health.
    """

    agent_type = AnalystType.FUNDAMENTAL

    async def analyze(self, task: ResearchTask) -> dict[str, Any]:
        # TODO: Implement LLM-powered fundamental analysis in Phase 2
        self.log.info("fundamental_analysis_placeholder", prompt=task.prompt[:100])
        return {
            "analyst": self.agent_type.value,
            "status": "placeholder",
            "message": "Fundamental analysis will be implemented with LLM integration in Phase 2.",
        }
