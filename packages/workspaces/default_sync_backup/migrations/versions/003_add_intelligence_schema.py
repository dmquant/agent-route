"""Add intelligence schema and missing market data tables.

Revision ID: 003_add_intelligence
Revises: 002_add_daily_klines
Create Date: 2026-04-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "003_add_intelligence"
down_revision: str | None = "002_add_daily_klines"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Schemas ──────────────────────────────────────────────
    op.execute("CREATE SCHEMA IF NOT EXISTS intelligence")

    # ── market_data.income_sheets ────────────────────────────
    op.create_table(
        "income_sheets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("market_data.stocks.id"), nullable=False),
        sa.Column("ann_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("report_type", sa.String(20), nullable=False),
        sa.Column("revenue", sa.Numeric(20, 4), nullable=True),
        sa.Column("n_income", sa.Numeric(20, 4), nullable=True),
        sa.Column("n_income_attr_p", sa.Numeric(20, 4), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="market_data",
    )
    op.create_index("ix_income_sheets_stock_id_end_date", "income_sheets", ["stock_id", "end_date"], schema="market_data")
    op.create_index("ix_income_sheets_ann_date", "income_sheets", ["ann_date"], schema="market_data")

    # ── market_data.balance_sheets ───────────────────────────
    op.create_table(
        "balance_sheets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("market_data.stocks.id"), nullable=False),
        sa.Column("ann_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("report_type", sa.String(20), nullable=False),
        sa.Column("total_assets", sa.Numeric(20, 4), nullable=True),
        sa.Column("total_liab", sa.Numeric(20, 4), nullable=True),
        sa.Column("total_hals_attr_p", sa.Numeric(20, 4), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="market_data",
    )
    op.create_index("ix_balance_sheets_stock_id_end_date", "balance_sheets", ["stock_id", "end_date"], schema="market_data")
    op.create_index("ix_balance_sheets_ann_date", "balance_sheets", ["ann_date"], schema="market_data")

    # ── market_data.cash_flows ───────────────────────────────
    op.create_table(
        "cash_flows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("market_data.stocks.id"), nullable=False),
        sa.Column("ann_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("report_type", sa.String(20), nullable=False),
        sa.Column("net_cash_flows_oper_act", sa.Numeric(20, 4), nullable=True),
        sa.Column("net_cash_flows_inv_act", sa.Numeric(20, 4), nullable=True),
        sa.Column("net_cash_flows_fnc_act", sa.Numeric(20, 4), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="market_data",
    )
    op.create_index("ix_cash_flows_stock_id_end_date", "cash_flows", ["stock_id", "end_date"], schema="market_data")
    op.create_index("ix_cash_flows_ann_date", "cash_flows", ["ann_date"], schema="market_data")

    # ── intelligence.news ────────────────────────────────────
    op.create_table(
        "news",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("publish_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("url", sa.String(1000), nullable=False),
        sa.Column("category", sa.String(50), server_default="news", nullable=False),
        sa.Column("related_stocks", postgresql.JSONB, nullable=True),
        sa.Column("metadata_json", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="intelligence",
    )
    op.create_index("ix_news_publish_time", "news", ["publish_time"], schema="intelligence")
    op.create_index("ix_news_url", "news", ["url"], unique=True, schema="intelligence")
    op.create_index("ix_news_category", "news", ["category"], schema="intelligence")

    # ── intelligence.announcements ───────────────────────────
    op.create_table(
        "announcements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("publish_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stock_symbol", sa.String(20), nullable=False),
        sa.Column("url", sa.String(1000), nullable=False),
        sa.Column("ann_type", sa.String(100), nullable=True),
        sa.Column("file_path", sa.String(1000), nullable=True),
        sa.Column("raw_content", sa.Text, nullable=True),
        sa.Column("metadata_json", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="intelligence",
    )
    op.create_index("ix_announcements_publish_time", "announcements", ["publish_time"], schema="intelligence")
    op.create_index("ix_announcements_url", "announcements", ["url"], unique=True, schema="intelligence")
    op.create_index("ix_announcements_stock_symbol", "announcements", ["stock_symbol"], schema="intelligence")

    # ── intelligence.market_fund_flows ───────────────────────
    op.create_table(
        "market_fund_flows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("trade_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("main_net_inflow", sa.Numeric(20, 4), nullable=True),
        sa.Column("main_net_inflow_pct", sa.Numeric(10, 4), nullable=True),
        sa.Column("super_large_inflow", sa.Numeric(20, 4), nullable=True),
        sa.Column("large_inflow", sa.Numeric(20, 4), nullable=True),
        sa.Column("medium_inflow", sa.Numeric(20, 4), nullable=True),
        sa.Column("small_inflow", sa.Numeric(20, 4), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="intelligence",
    )
    op.create_index("ix_mff_trade_date", "market_fund_flows", ["trade_date"], schema="intelligence")
    op.create_index("ix_mff_symbol_date", "market_fund_flows", ["symbol", "trade_date"], unique=True, schema="intelligence")

    # ── intelligence.crawler_status ──────────────────────────
    op.create_table(
        "crawler_status",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("last_crawl_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_records", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="intelligence",
    )
    op.create_index("ix_crawler_status_source_category", "crawler_status", ["source", "category"], unique=True, schema="intelligence")


def downgrade() -> None:
    op.drop_table("crawler_status", schema="intelligence")
    op.drop_table("market_fund_flows", schema="intelligence")
    op.drop_table("announcements", schema="intelligence")
    op.drop_table("news", schema="intelligence")
    op.drop_table("cash_flows", schema="market_data")
    op.drop_table("balance_sheets", schema="market_data")
    op.drop_table("income_sheets", schema="market_data")
    op.execute("DROP SCHEMA IF EXISTS intelligence CASCADE")
