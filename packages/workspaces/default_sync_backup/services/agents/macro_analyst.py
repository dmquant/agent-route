"""Macro analyst agent - analyzes macroeconomic factors."""

from typing import Any

from libs.db.models import AnalystType, ResearchTask
from services.agents.base import BaseAnalystAgent


class MacroAnalystAgent(BaseAnalystAgent):
    """Analyzes macroeconomic indicators and their impact on stocks.

    Covers: GDP, interest rates, inflation, trade policy, geopolitical events.
    """

    agent_type = AnalystType.MACRO

    async def analyze(self, task: ResearchTask) -> dict[str, Any]:
        # TODO: Implement LLM-powered macro analysis in Phase 2
        self.log.info("macro_analysis_placeholder", prompt=task.prompt[:100])
        return {
            "analyst": self.agent_type.value,
            "status": "placeholder",
            "message": "Macro analysis will be implemented with LLM integration in Phase 2.",
        }
