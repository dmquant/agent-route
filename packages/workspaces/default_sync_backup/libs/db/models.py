"""Domain models for the stock research platform.

These are the core tables shared across all analyst agents.
Schemas:
  - market_data: stocks and market information
  - analysis: research tasks and reports
  - agents: agent registry, executions, events, and feedback
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import ClassVar, List, Optional, Union

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from libs.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

# ── Enums ────────────────────────────────────────────────────────


class AnalystType(str, Enum):
    """The six analyst agent types."""

    MACRO = "macro"
    TECHNICAL = "technical"
    FUNDAMENTAL = "fundamental"
    SENTIMENT = "sentiment"
    RISK = "risk"
    QUANTITATIVE = "quantitative"


class ResearchStatus(str, Enum):
    """Lifecycle status of a research task."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ExecutionStatus(str, Enum):
    """Lifecycle status of an agent execution."""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EventLevel(str, Enum):
    """Severity level for agent events."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class FeedbackRating(str, Enum):
    """User feedback rating."""

    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


# ── Market Data Schema ───────────────────────────────────────────


class Stock(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A stock/security being tracked."""

    __tablename__ = "stocks"
    __table_args__ = (
        Index("ix_stocks_symbol", "symbol", unique=True),
        {"schema": "market_data"},
    )

    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    exchange: Mapped[str] = mapped_column(String(50), nullable=False)
    sector: Mapped[Optional[str]] = mapped_column(String(100))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)

    research_tasks: Mapped[List[ResearchTask]] = relationship(back_populates="stock")
    daily_klines: Mapped[List[DailyKLine]] = relationship(
        back_populates="stock", cascade="all, delete-orphan"
    )


class DailyKLine(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Daily market data (K-line) for a stock."""

    __tablename__ = "daily_klines"
    __table_args__ = (
        Index("ix_daily_klines_stock_id_date", "stock_id", "date", unique=True),
        Index("ix_daily_klines_date", "date"),
        {"schema": "market_data"},
    )

    stock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market_data.stocks.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    open: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    volume: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    adj_factor: Mapped[Decimal] = mapped_column(
        Numeric(20, 6), default=Decimal("1.0"), nullable=False
    )

    stock: Mapped[Stock] = relationship(back_populates="daily_klines")


class IncomeSheet(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Financial income statement data."""

    __tablename__ = "income_sheets"
    __table_args__ = (
        Index("ix_income_sheets_stock_id_end_date", "stock_id", "end_date"),
        Index("ix_income_sheets_ann_date", "ann_date"),
        {"schema": "market_data"},
    )

    stock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market_data.stocks.id"), nullable=False
    )
    ann_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    report_type: Mapped[str] = mapped_column(String(20), nullable=False)
    revenue: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    n_income: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    n_income_attr_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)

    stock: Mapped[Stock] = relationship()


class BalanceSheet(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Financial balance sheet data."""

    __tablename__ = "balance_sheets"
    __table_args__ = (
        Index("ix_balance_sheets_stock_id_end_date", "stock_id", "end_date"),
        Index("ix_balance_sheets_ann_date", "ann_date"),
        {"schema": "market_data"},
    )

    stock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market_data.stocks.id"), nullable=False
    )
    ann_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    report_type: Mapped[str] = mapped_column(String(20), nullable=False)
    total_assets: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    total_liab: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    total_hals_attr_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)

    stock: Mapped[Stock] = relationship()


class CashFlow(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Financial cash flow statement data."""

    __tablename__ = "cash_flows"
    __table_args__ = (
        Index("ix_cash_flows_stock_id_end_date", "stock_id", "end_date"),
        Index("ix_cash_flows_ann_date", "ann_date"),
        {"schema": "market_data"},
    )

    stock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market_data.stocks.id"), nullable=False
    )
    ann_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    report_type: Mapped[str] = mapped_column(String(20), nullable=False)
    net_cash_flows_oper_act: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    net_cash_flows_inv_act: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    net_cash_flows_fnc_act: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)

    stock: Mapped[Stock] = relationship()


class IndexComponent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Index components and weights."""

    __tablename__ = "index_components"
    __table_args__ = (
        Index("ix_index_components_index_symbol_date", "index_symbol", "trade_date"),
        Index("ix_index_components_stock_symbol", "stock_symbol"),
        Index(
            "ix_index_components_index_stock_date",
            "index_symbol",
            "stock_symbol",
            "trade_date",
            unique=True,
        ),
        {"schema": "market_data"},
    )

    index_symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    stock_symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))


class Dividend(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Dividend and bonus data."""

    __tablename__ = "dividends"
    __table_args__ = (
        Index("ix_dividends_stock_id_ann_date", "stock_id", "ann_date"),
        Index("ix_dividends_ex_date", "ex_date"),
        {"schema": "market_data"},
    )

    stock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market_data.stocks.id"), nullable=False
    )
    ann_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    ex_date: Mapped[Optional[date]] = mapped_column(Date)
    pay_date: Mapped[Optional[date]] = mapped_column(Date)
    cash_div_tax: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    bonus_share: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)

    stock: Mapped[Stock] = relationship()


# ── Analysis Schema ──────────────────────────────────────────────


class ResearchTask(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A research task assigned to an analyst agent."""

    __tablename__ = "research_tasks"
    __table_args__ = (
        Index("ix_research_tasks_status", "status"),
        Index("ix_research_tasks_analyst", "analyst_type"),
        Index("ix_research_tasks_status_analyst", "status", "analyst_type"),
        Index("ix_research_tasks_stock_status", "stock_id", "status"),
        {"schema": "analysis"},
    )

    stock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market_data.stocks.id"), nullable=False
    )
    analyst_type: Mapped[AnalystType] = mapped_column(
        SAEnum(AnalystType, schema="analysis", name="analysttype"), nullable=False
    )
    status: Mapped[ResearchStatus] = mapped_column(
        SAEnum(ResearchStatus, schema="analysis", name="researchstatus"),
        default=ResearchStatus.PENDING,
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[Optional[dict]] = mapped_column(JSONB)
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    stock: Mapped[Stock] = relationship(back_populates="research_tasks")
    executions: Mapped[List[Execution]] = relationship(back_populates="task")


class AnalysisReport(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A consolidated analysis report combining multiple agent outputs."""

    __tablename__ = "analysis_reports"
    __table_args__: ClassVar = {"schema": "analysis"}

    stock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market_data.stocks.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    sections: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 4))


# ── Agents Schema ────────────────────────────────────────────────


class Agent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Registry of analyst agents and their configuration."""

    __tablename__ = "agents"
    __table_args__ = (
        Index("ix_agents_analyst_type", "analyst_type", unique=True),
        Index("ix_agents_is_active", "is_active"),
        {"schema": "agents"},
    )

    analyst_type: Mapped[AnalystType] = mapped_column(
        SAEnum(AnalystType, schema="agents", name="analysttype"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    config: Mapped[Optional[dict]] = mapped_column(JSONB)
    model_name: Mapped[Optional[str]] = mapped_column(String(100))
    version: Mapped[str] = mapped_column(String(20), default="1.0.0", nullable=False)

    executions: Mapped[List[Execution]] = relationship(back_populates="agent")
    events: Mapped[List[Event]] = relationship(back_populates="agent")


class Execution(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Record of an agent executing a research task."""

    __tablename__ = "executions"
    __table_args__ = (
        Index("ix_executions_status", "status"),
        Index("ix_executions_agent_status", "agent_id", "status"),
        Index("ix_executions_task_id", "task_id"),
        Index("ix_executions_started_at", "started_at"),
        {"schema": "agents"},
    )

    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.agents.id"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analysis.research_tasks.id"), nullable=False
    )
    status: Mapped[ExecutionStatus] = mapped_column(
        SAEnum(ExecutionStatus, schema="agents", name="executionstatus"),
        default=ExecutionStatus.QUEUED,
        nullable=False,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    input_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    output_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    error_detail: Mapped[Optional[str]] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    agent: Mapped[Agent] = relationship(back_populates="executions")
    task: Mapped[ResearchTask] = relationship(back_populates="executions")
    events: Mapped[List[Event]] = relationship(back_populates="execution")
    feedbacks: Mapped[List[Feedback]] = relationship(back_populates="execution")


class Event(Base, UUIDPrimaryKeyMixin):
    """Audit log for agent lifecycle events."""

    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_agent_id", "agent_id"),
        Index("ix_events_execution_id", "execution_id"),
        Index("ix_events_level", "level"),
        Index("ix_events_agent_level", "agent_id", "level"),
        Index("ix_events_created_at", "created_at"),
        {"schema": "agents"},
    )

    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.agents.id"), nullable=False
    )
    execution_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("agents.executions.id")
    )
    level: Mapped[EventLevel] = mapped_column(
        SAEnum(EventLevel, schema="agents", name="eventlevel"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    agent: Mapped[Agent] = relationship(back_populates="events")
    execution: Mapped[Execution] = relationship(back_populates="events")


class Feedback(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """User feedback on agent execution results."""

    __tablename__ = "feedbacks"
    __table_args__ = (
        Index("ix_feedbacks_execution_id", "execution_id"),
        Index("ix_feedbacks_rating", "rating"),
        Index("ix_feedbacks_agent_rating", "agent_id", "rating"),
        {"schema": "agents"},
    )

    execution_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.executions.id"), nullable=False
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.agents.id"), nullable=False
    )
    rating: Mapped[FeedbackRating] = mapped_column(
        SAEnum(FeedbackRating, schema="agents", name="feedbackrating"), nullable=False
    )
    comment: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[dict]] = mapped_column(JSONB)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(100))

    execution: Mapped[Execution] = relationship(back_populates="feedbacks")
    agent: Mapped[Agent] = relationship()


# ── Scheduler Schema ──────────────────────────────────────────────


class SchedulerLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Log of scheduler task executions."""

    __tablename__ = "scheduler_logs"
    __table_args__ = (
        Index("ix_scheduler_logs_task_name", "task_name"),
        Index("ix_scheduler_logs_status", "status"),
        Index("ix_scheduler_logs_started_at", "started_at"),
        {"schema": "agents"},
    )

    task_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # success, failed
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    collection_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)
