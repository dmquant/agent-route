"""Agent-related API endpoints."""

from typing import Any

import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from libs.db.models import AnalystType

logger = structlog.get_logger(__name__)

router = APIRouter()


class AgentInfo(BaseModel):
    """Agent metadata response."""

    name: str
    type: str
    description: str
    status: str


AGENT_DESCRIPTIONS: dict[AnalystType, str] = {
    AnalystType.MACRO: "Analyzes macroeconomic indicators and their impact on stocks",
    AnalystType.TECHNICAL: "Analyzes price charts, volume patterns, and technical indicators",
    AnalystType.FUNDAMENTAL: "Analyzes company financials, earnings, and intrinsic value",
    AnalystType.SENTIMENT: "Analyzes news sentiment, social media trends, and market mood",
    AnalystType.RISK: "Evaluates risk factors and downside scenarios",
    AnalystType.QUANTITATIVE: "Applies quantitative models and statistical analysis",
}


@router.get("/agents", response_model=list[AgentInfo])
async def list_agents() -> list[dict[str, Any]]:
    """List all available analyst agents."""
    return [
        {
            "name": f"{t.value.capitalize()} Analyst",
            "type": t.value,
            "description": desc,
            "status": "ready",
        }
        for t, desc in AGENT_DESCRIPTIONS.items()
    ]


@router.get("/agents/{analyst_type}")
async def get_agent_info(analyst_type: AnalystType) -> dict[str, Any]:
    """Get details for a specific analyst agent."""
    return {
        "name": f"{analyst_type.value.capitalize()} Analyst",
        "type": analyst_type.value,
        "description": AGENT_DESCRIPTIONS[analyst_type],
        "status": "ready",
    }
