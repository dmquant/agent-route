"""Add daily_klines table for market data.

Revision ID: 002_add_daily_klines
Revises: 001_initial
Create Date: 2026-04-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002_add_daily_klines"
down_revision: str | None = "001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── market_data.daily_klines ─────────────────────────────
    op.create_table(
        "daily_klines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("uuid_generate_v4()")),
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("market_data.stocks.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("open", sa.Numeric(20, 4), nullable=False),
        sa.Column("high", sa.Numeric(20, 4), nullable=False),
        sa.Column("low", sa.Numeric(20, 4), nullable=False),
        sa.Column("close", sa.Numeric(20, 4), nullable=False),
        sa.Column("volume", sa.Numeric(20, 4), nullable=False),
        sa.Column("amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("adj_factor", sa.Numeric(20, 6), server_default="1.0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="market_data",
    )
    op.create_index(
        "ix_daily_klines_stock_id_date",
        "daily_klines",
        ["stock_id", "date"],
        unique=True,
        schema="market_data",
    )
    op.create_index(
        "ix_daily_klines_date",
        "daily_klines",
        ["date"],
        schema="market_data",
    )


def downgrade() -> None:
    op.drop_table("daily_klines", schema="market_data")
