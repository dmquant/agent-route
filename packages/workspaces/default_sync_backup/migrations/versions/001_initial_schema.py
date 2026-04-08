"""Initial database schema — all core tables.

Revision ID: 001_initial
Revises:
Create Date: 2026-04-06

Tables created:
  market_data.stocks
  analysis.research_tasks
  analysis.analysis_reports
  agents.agents
  agents.executions
  agents.events
  agents.feedbacks
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Schemas ──────────────────────────────────────────────
    op.execute("CREATE SCHEMA IF NOT EXISTS market_data")
    op.execute("CREATE SCHEMA IF NOT EXISTS analysis")
    op.execute("CREATE SCHEMA IF NOT EXISTS agents")

    # ── Extensions ───────────────────────────────────────────
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # ── Enum types ───────────────────────────────────────────
    analysttype_analysis = postgresql.ENUM(
        "macro", "technical", "fundamental", "sentiment", "risk", "quantitative",
        name="analysttype", schema="analysis", create_type=False,
    )
    researchstatus = postgresql.ENUM(
        "pending", "running", "completed", "failed",
        name="researchstatus", schema="analysis", create_type=False,
    )
    analysttype_agents = postgresql.ENUM(
        "macro", "technical", "fundamental", "sentiment", "risk", "quantitative",
        name="analysttype", schema="agents", create_type=False,
    )
    executionstatus = postgresql.ENUM(
        "queued", "running", "completed", "failed", "cancelled",
        name="executionstatus", schema="agents", create_type=False,
    )
    eventlevel = postgresql.ENUM(
        "debug", "info", "warning", "error",
        name="eventlevel", schema="agents", create_type=False,
    )
    feedbackrating = postgresql.ENUM(
        "positive", "neutral", "negative",
        name="feedbackrating", schema="agents", create_type=False,
    )

    # Create enum types explicitly
    analysttype_analysis.create(op.get_bind(), checkfirst=True)
    researchstatus.create(op.get_bind(), checkfirst=True)
    analysttype_agents.create(op.get_bind(), checkfirst=True)
    executionstatus.create(op.get_bind(), checkfirst=True)
    eventlevel.create(op.get_bind(), checkfirst=True)
    feedbackrating.create(op.get_bind(), checkfirst=True)

    # ── market_data.stocks ───────────────────────────────────
    op.create_table(
        "stocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("exchange", sa.String(50), nullable=False),
        sa.Column("sector", sa.String(100), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="market_data",
    )
    op.create_index("ix_stocks_symbol", "stocks", ["symbol"], unique=True, schema="market_data")

    # ── analysis.research_tasks ──────────────────────────────
    op.create_table(
        "research_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("market_data.stocks.id"), nullable=False),
        sa.Column("analyst_type", analysttype_analysis, nullable=False),
        sa.Column("status", researchstatus, server_default="pending", nullable=False),
        sa.Column("priority", sa.Integer, server_default="0", nullable=False),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("result", postgresql.JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="analysis",
    )
    op.create_index("ix_research_tasks_status", "research_tasks", ["status"], schema="analysis")
    op.create_index("ix_research_tasks_analyst", "research_tasks", ["analyst_type"], schema="analysis")
    op.create_index("ix_research_tasks_status_analyst", "research_tasks", ["status", "analyst_type"], schema="analysis")
    op.create_index("ix_research_tasks_stock_status", "research_tasks", ["stock_id", "status"], schema="analysis")

    # ── analysis.analysis_reports ────────────────────────────
    op.create_table(
        "analysis_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("market_data.stocks.id"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("sections", postgresql.JSONB, nullable=False),
        sa.Column("confidence_score", sa.Numeric(5, 4), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="analysis",
    )

    # ── agents.agents ────────────────────────────────────────
    op.create_table(
        "agents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("analyst_type", analysttype_agents, nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("config", postgresql.JSONB, nullable=True),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("version", sa.String(20), server_default="1.0.0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="agents",
    )
    op.create_index("ix_agents_analyst_type", "agents", ["analyst_type"], unique=True, schema="agents")
    op.create_index("ix_agents_is_active", "agents", ["is_active"], schema="agents")

    # ── agents.executions ────────────────────────────────────
    op.create_table(
        "executions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.agents.id"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("analysis.research_tasks.id"), nullable=False),
        sa.Column("status", executionstatus, server_default="queued", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("input_data", postgresql.JSONB, nullable=True),
        sa.Column("output_data", postgresql.JSONB, nullable=True),
        sa.Column("error_detail", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="agents",
    )
    op.create_index("ix_executions_status", "executions", ["status"], schema="agents")
    op.create_index("ix_executions_agent_status", "executions", ["agent_id", "status"], schema="agents")
    op.create_index("ix_executions_task_id", "executions", ["task_id"], schema="agents")
    op.create_index("ix_executions_started_at", "executions", ["started_at"], schema="agents")

    # ── agents.events ────────────────────────────────────────
    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.agents.id"), nullable=False),
        sa.Column("execution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.executions.id"), nullable=True),
        sa.Column("level", eventlevel, nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="agents",
    )
    op.create_index("ix_events_agent_id", "events", ["agent_id"], schema="agents")
    op.create_index("ix_events_execution_id", "events", ["execution_id"], schema="agents")
    op.create_index("ix_events_level", "events", ["level"], schema="agents")
    op.create_index("ix_events_agent_level", "events", ["agent_id", "level"], schema="agents")
    op.create_index("ix_events_created_at", "events", ["created_at"], schema="agents")

    # ── agents.feedbacks ─────────────────────────────────────
    op.create_table(
        "feedbacks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("execution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.executions.id"), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.agents.id"), nullable=False),
        sa.Column("rating", feedbackrating, nullable=False),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("tags", postgresql.JSONB, nullable=True),
        sa.Column("reviewed_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="agents",
    )
    op.create_index("ix_feedbacks_execution_id", "feedbacks", ["execution_id"], schema="agents")
    op.create_index("ix_feedbacks_rating", "feedbacks", ["rating"], schema="agents")
    op.create_index("ix_feedbacks_agent_rating", "feedbacks", ["agent_id", "rating"], schema="agents")


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.drop_table("feedbacks", schema="agents")
    op.drop_table("events", schema="agents")
    op.drop_table("executions", schema="agents")
    op.drop_table("agents", schema="agents")
    op.drop_table("analysis_reports", schema="analysis")
    op.drop_table("research_tasks", schema="analysis")
    op.drop_table("stocks", schema="market_data")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS agents.feedbackrating")
    op.execute("DROP TYPE IF EXISTS agents.eventlevel")
    op.execute("DROP TYPE IF EXISTS agents.executionstatus")
    op.execute("DROP TYPE IF EXISTS agents.analysttype")
    op.execute("DROP TYPE IF EXISTS analysis.researchstatus")
    op.execute("DROP TYPE IF EXISTS analysis.analysttype")

    # Drop schemas (only if empty)
    op.execute("DROP SCHEMA IF EXISTS agents CASCADE")
    op.execute("DROP SCHEMA IF EXISTS analysis CASCADE")
    op.execute("DROP SCHEMA IF EXISTS market_data CASCADE")
