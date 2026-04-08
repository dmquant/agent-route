"""Pydantic schemas for Kafka messages."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class KafkaMessageBase(BaseModel):
    """Base class for all Kafka messages with common metadata."""

    message_id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=datetime.now)


class NewsFinancial(KafkaMessageBase):
    """Schema for financial news events."""

    title: str = Field(..., description="News title")
    content: str = Field(..., description="Full text or summary")
    source: str = Field(..., description="Source of the news (e.g., EastMoney, Sina)")
    url: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    related_stocks: List[str] = Field(default_factory=list, description="List of stock codes mentioned")
    sentiment_score: Optional[float] = None


class AgentTask(KafkaMessageBase):
    """Schema for distributing tasks to agents."""

    task_id: str = Field(..., description="Unique task identifier")
    agent_type: str = Field(..., description="Target agent type (e.g., technical, fundamental)")
    stock_code: str = Field(..., description="Stock code to analyze")
    priority: int = Field(default=0, ge=0, le=10)
    params: Dict[str, Any] = Field(default_factory=dict, description="Task-specific parameters")


class AgentResult(KafkaMessageBase):
    """Schema for agents reporting their results."""

    task_id: str = Field(..., description="ID of the original task")
    agent_type: str = Field(..., description="Agent that produced the result")
    stock_code: str = Field(..., description="Stock code analyzed")
    status: str = Field(..., description="Status of the execution (success, failure)")
    result_data: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    execution_time_ms: float = 0.0


class MarketQuoteRealtime(KafkaMessageBase):
    """Schema for real-time market quotes."""

    stock_code: str = Field(..., description="Stock code (e.g., 600519.SH)")
    price: float = Field(..., description="Current price")
    open: float = Field(..., description="Opening price")
    high: float = Field(..., description="Highest price of the day")
    low: float = Field(..., description="Lowest price of the day")
    volume: float = Field(..., description="Trading volume")
    amount: float = Field(..., description="Trading amount")
    last_close: float = Field(..., description="Last closing price")
    change_pct: float = Field(..., description="Percentage change")
    trade_time: datetime = Field(..., description="Time of the trade")


class MarketKlineDaily(KafkaMessageBase):
    """Schema for daily K-line updates."""

    stock_code: str = Field(..., description="Stock code")
    trade_date: datetime = Field(..., description="Trading date")
    open: float = Field(..., description="Open price")
    close: float = Field(..., description="Close price")
    high: float = Field(..., description="High price")
    low: float = Field(..., description="Low price")
    volume: float = Field(..., description="Volume")
    amount: float = Field(..., description="Amount")
