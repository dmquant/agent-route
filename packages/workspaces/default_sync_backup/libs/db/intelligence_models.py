"""Domain models for market intelligence (news, announcements, etc.).

These are the tables used by the data collector to store scraped news and reports.
Schemas:
  - intelligence: news, announcements, and crawler status
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import ClassVar, List, Optional

from sqlalchemy import (
    DateTime,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from libs.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class News(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Financial news from various sources."""

    __tablename__ = "news"
    __table_args__ = (
        Index("ix_news_publish_time", "publish_time"),
        Index("ix_news_url", "url", unique=True),
        Index("ix_news_category", "category"),
        {"schema": "intelligence"},
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    publish_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="news", nullable=False)
    related_stocks: Mapped[Optional[dict]] = mapped_column(JSONB)  # List of stock symbols
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)


class Announcement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Company announcements."""

    __tablename__ = "announcements"
    __table_args__ = (
        Index("ix_announcements_publish_time", "publish_time"),
        Index("ix_announcements_url", "url", unique=True),
        Index("ix_announcements_stock_symbol", "stock_symbol"),
        {"schema": "intelligence"},
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text)
    publish_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stock_symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    ann_type: Mapped[Optional[str]] = mapped_column(String(100))
    file_path: Mapped[Optional[str]] = mapped_column(String(1000))
    raw_content: Mapped[Optional[str]] = mapped_column(Text)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)


class MarketFundFlow(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Market and sector fund flow data."""

    __tablename__ = "market_fund_flows"
    __table_args__ = (
        Index("ix_mff_trade_date", "trade_date"),
        Index("ix_mff_symbol_date", "symbol", "trade_date", unique=True),
        {"schema": "intelligence"},
    )

    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    trade_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    main_net_inflow: Mapped[Optional[float]] = mapped_column(Numeric(20, 4))
    main_net_inflow_pct: Mapped[Optional[float]] = mapped_column(Numeric(10, 4))
    super_large_inflow: Mapped[Optional[float]] = mapped_column(Numeric(20, 4))
    large_inflow: Mapped[Optional[float]] = mapped_column(Numeric(20, 4))
    medium_inflow: Mapped[Optional[float]] = mapped_column(Numeric(20, 4))
    small_inflow: Mapped[Optional[float]] = mapped_column(Numeric(20, 4))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)


class CrawlerStatus(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Incremental sync status for various crawlers."""

    __tablename__ = "crawler_status"
    __table_args__ = (
        Index("ix_crawler_status_source_category", "source", "category", unique=True),
        {"schema": "intelligence"},
    )

    source: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    last_crawl_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    total_records: Mapped[int] = mapped_column(default=0, nullable=False)
