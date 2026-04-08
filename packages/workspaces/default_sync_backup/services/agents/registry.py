"""Agent registry - maps analyst types to their implementations."""

from libs.db.models import AnalystType
from services.agents.base import BaseAnalystAgent
from services.agents.fundamental_analyst import FundamentalAnalystAgent
from services.agents.macro_analyst import MacroAnalystAgent
from services.agents.quantitative_analyst import QuantitativeAnalystAgent
from services.agents.risk_analyst import RiskAnalystAgent
from services.agents.sentiment_analyst import SentimentAnalystAgent
from services.agents.technical_analyst import TechnicalAnalystAgent

AGENT_REGISTRY: dict[AnalystType, type[BaseAnalystAgent]] = {
    AnalystType.MACRO: MacroAnalystAgent,
    AnalystType.TECHNICAL: TechnicalAnalystAgent,
    AnalystType.FUNDAMENTAL: FundamentalAnalystAgent,
    AnalystType.SENTIMENT: SentimentAnalystAgent,
    AnalystType.RISK: RiskAnalystAgent,
    AnalystType.QUANTITATIVE: QuantitativeAnalystAgent,
}


def get_agent(analyst_type: AnalystType, **kwargs) -> BaseAnalystAgent:
    """Instantiate an agent by its type."""
    cls = AGENT_REGISTRY.get(analyst_type)
    if cls is None:
        raise ValueError(f"Unknown analyst type: {analyst_type}")
    return cls(**kwargs)
