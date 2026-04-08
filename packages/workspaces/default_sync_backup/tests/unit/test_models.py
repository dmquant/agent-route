"""Tests for database models and schema configuration."""


import pytest

from libs.db.base import Base
from libs.db.models import (
    Agent,
    AnalysisReport,
    AnalystType,
    Event,
    EventLevel,
    Execution,
    ExecutionStatus,
    Feedback,
    FeedbackRating,
    ResearchStatus,
    ResearchTask,
    Stock,
)


@pytest.mark.unit
class TestEnums:
    """Enum value tests — ensure they match the migration."""

    def test_analyst_types(self):
        assert len(AnalystType) == 6
        assert set(AnalystType) == {
            AnalystType.MACRO,
            AnalystType.TECHNICAL,
            AnalystType.FUNDAMENTAL,
            AnalystType.SENTIMENT,
            AnalystType.RISK,
            AnalystType.QUANTITATIVE,
        }

    def test_research_status(self):
        assert set(ResearchStatus) == {"pending", "running", "completed", "failed"}

    def test_execution_status(self):
        assert set(ExecutionStatus) == {"queued", "running", "completed", "failed", "cancelled"}

    def test_event_level(self):
        assert set(EventLevel) == {"debug", "info", "warning", "error"}

    def test_feedback_rating(self):
        assert set(FeedbackRating) == {"positive", "neutral", "negative"}


@pytest.mark.unit
class TestModelSchemas:
    """Verify each model maps to the correct PostgreSQL schema."""

    def test_stock_schema(self):
        assert Stock.__table__.schema == "market_data"
        assert Stock.__tablename__ == "stocks"

    def test_research_task_schema(self):
        assert ResearchTask.__table__.schema == "analysis"
        assert ResearchTask.__tablename__ == "research_tasks"

    def test_analysis_report_schema(self):
        assert AnalysisReport.__table__.schema == "analysis"
        assert AnalysisReport.__tablename__ == "analysis_reports"

    def test_agent_schema(self):
        assert Agent.__table__.schema == "agents"
        assert Agent.__tablename__ == "agents"

    def test_execution_schema(self):
        assert Execution.__table__.schema == "agents"
        assert Execution.__tablename__ == "executions"

    def test_event_schema(self):
        assert Event.__table__.schema == "agents"
        assert Event.__tablename__ == "events"

    def test_feedback_schema(self):
        assert Feedback.__table__.schema == "agents"
        assert Feedback.__tablename__ == "feedbacks"


@pytest.mark.unit
class TestModelColumns:
    """Spot-check that critical columns exist on each model."""

    def test_stock_columns(self):
        cols = {c.name for c in Stock.__table__.columns}
        assert {"id", "symbol", "name", "exchange", "sector", "metadata_json"} <= cols

    def test_research_task_columns(self):
        cols = {c.name for c in ResearchTask.__table__.columns}
        assert {"id", "stock_id", "analyst_type", "status", "priority", "prompt", "result"} <= cols

    def test_agent_columns(self):
        cols = {c.name for c in Agent.__table__.columns}
        assert {"id", "analyst_type", "display_name", "description", "is_active", "config", "model_name", "version"} <= cols

    def test_execution_columns(self):
        cols = {c.name for c in Execution.__table__.columns}
        assert {"id", "agent_id", "task_id", "status", "started_at", "completed_at", "duration_ms", "retry_count"} <= cols

    def test_event_columns(self):
        cols = {c.name for c in Event.__table__.columns}
        assert {"id", "agent_id", "execution_id", "level", "event_type", "message", "payload"} <= cols

    def test_feedback_columns(self):
        cols = {c.name for c in Feedback.__table__.columns}
        assert {"id", "execution_id", "agent_id", "rating", "comment", "tags"} <= cols


@pytest.mark.unit
class TestModelIndexes:
    """Verify composite and single-column indexes are declared."""

    def _index_names(self, model):
        return {idx.name for idx in model.__table__.indexes}

    def test_research_task_indexes(self):
        names = self._index_names(ResearchTask)
        assert "ix_research_tasks_status_analyst" in names
        assert "ix_research_tasks_stock_status" in names

    def test_agent_indexes(self):
        names = self._index_names(Agent)
        assert "ix_agents_analyst_type" in names
        assert "ix_agents_is_active" in names

    def test_execution_indexes(self):
        names = self._index_names(Execution)
        assert "ix_executions_agent_status" in names
        assert "ix_executions_task_id" in names

    def test_event_indexes(self):
        names = self._index_names(Event)
        assert "ix_events_agent_level" in names
        assert "ix_events_created_at" in names

    def test_feedback_indexes(self):
        names = self._index_names(Feedback)
        assert "ix_feedbacks_agent_rating" in names


@pytest.mark.unit
class TestMetadataCompleteness:
    """Ensure all models are registered in the Base metadata."""

    def test_all_tables_registered(self):
        table_names = {t.name for t in Base.metadata.sorted_tables}
        expected = {
            "stocks",
            "daily_klines",
            "research_tasks",
            "analysis_reports",
            "agents",
            "executions",
            "events",
            "feedbacks",
        }
        assert expected <= table_names

    def test_table_count(self):
        assert len(Base.metadata.sorted_tables) == 19
