"""Integration tests for database migrations and seed operations.

These tests require a running PostgreSQL instance.
Use ``make infra-up && make wait`` before running:

    make test-integration
"""

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from configs.settings import Settings


def _alembic_cfg(db_url: str) -> Config:
    """Build an Alembic Config pointing at the given database."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def _make_engine(db_url: str):
    return create_engine(db_url, echo=False)


@pytest.fixture(scope="module")
def db_url():
    """Return the sync database URL for integration tests."""
    settings = Settings()
    return settings.database_url_sync


@pytest.fixture(scope="module")
def alembic_cfg(db_url):
    return _alembic_cfg(db_url)


@pytest.fixture(scope="module")
def engine(db_url):
    eng = _make_engine(db_url)
    yield eng
    eng.dispose()


@pytest.mark.integration
class TestMigrationLifecycle:
    """Test that migrations can be applied and rolled back cleanly."""

    def test_upgrade_head(self, alembic_cfg):
        """Running 'alembic upgrade head' should complete without error."""
        command.upgrade(alembic_cfg, "head")

    def test_schemas_exist(self, engine):
        """All three managed schemas should exist after migration."""
        insp = inspect(engine)
        available = insp.get_schema_names()
        for schema in ("market_data", "analysis", "agents"):
            assert schema in available, f"Schema '{schema}' not found"

    def test_tables_exist(self, engine):
        """All core tables should exist in their respective schemas."""
        insp = inspect(engine)

        md_tables = insp.get_table_names(schema="market_data")
        assert "stocks" in md_tables
        assert "daily_klines" in md_tables

        analysis_tables = insp.get_table_names(schema="analysis")
        assert "research_tasks" in analysis_tables
        assert "analysis_reports" in analysis_tables

        agents_tables = insp.get_table_names(schema="agents")
        assert "agents" in agents_tables
        assert "executions" in agents_tables
        assert "events" in agents_tables
        assert "feedbacks" in agents_tables

    def test_indexes_created(self, engine):
        """Critical composite indexes should exist."""
        insp = inspect(engine)

        rt_indexes = {idx["name"] for idx in insp.get_indexes("research_tasks", schema="analysis")}
        assert "ix_research_tasks_status_analyst" in rt_indexes
        assert "ix_research_tasks_stock_status" in rt_indexes

        exec_indexes = {idx["name"] for idx in insp.get_indexes("executions", schema="agents")}
        assert "ix_executions_agent_status" in exec_indexes

        event_indexes = {idx["name"] for idx in insp.get_indexes("events", schema="agents")}
        assert "ix_events_agent_level" in event_indexes

    def test_downgrade_and_upgrade_roundtrip(self, alembic_cfg, engine):
        """Downgrade to base and back to head should be clean."""
        command.downgrade(alembic_cfg, "base")

        # Verify tables are gone
        insp = inspect(engine)
        agents_tables = insp.get_table_names(schema="agents")
        assert "agents" not in agents_tables

        # Re-apply
        command.upgrade(alembic_cfg, "head")

        insp = inspect(engine)
        agents_tables = insp.get_table_names(schema="agents")
        assert "agents" in agents_tables

    def test_current_revision_matches_head(self, alembic_cfg, engine):
        """After upgrade head, current revision should be '001_initial'."""
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT version_num FROM public.alembic_version")
            )
            row = result.fetchone()
            assert row is not None
            assert row[0] == "001_initial"


@pytest.mark.integration
class TestSeedIdempotency:
    """Test that the seed script runs idempotently."""

    def test_seed_inserts_agents(self, engine):
        """After seeding, all 6 agents should exist."""
        from scripts.seed import run_seed

        run_seed(dry_run=False)

        with Session(engine) as session:
            result = session.execute(text("SELECT COUNT(*) FROM agents.agents"))
            count = result.scalar()
            assert count == 6

    def test_seed_is_idempotent(self, engine):
        """Running seed twice should not duplicate rows."""
        from scripts.seed import run_seed

        run_seed(dry_run=False)
        run_seed(dry_run=False)

        with Session(engine) as session:
            result = session.execute(text("SELECT COUNT(*) FROM agents.agents"))
            count = result.scalar()
            assert count == 6

    def test_seed_agent_data_correct(self, engine):
        """Seeded agents should have correct analyst types and be active."""
        with Session(engine) as session:
            result = session.execute(
                text("SELECT analyst_type, is_active FROM agents.agents ORDER BY analyst_type")
            )
            rows = result.fetchall()
            types = {row[0] for row in rows}
            assert types == {
                "fundamental", "macro", "quantitative",
                "risk", "sentiment", "technical",
            }
            assert all(row[1] for row in rows), "All seeded agents should be active"

    def test_seed_dry_run_makes_no_changes(self, engine):
        """Dry-run mode should not insert any new rows."""
        # Clear agents first
        with Session(engine) as session, session.begin():
            session.execute(text("DELETE FROM agents.feedbacks"))
            session.execute(text("DELETE FROM agents.events"))
            session.execute(text("DELETE FROM agents.executions"))
            session.execute(text("DELETE FROM agents.agents"))

        from scripts.seed import run_seed

        run_seed(dry_run=True)

        with Session(engine) as session:
            result = session.execute(text("SELECT COUNT(*) FROM agents.agents"))
            count = result.scalar()
            assert count == 0

        # Re-seed for other tests
        run_seed(dry_run=False)
