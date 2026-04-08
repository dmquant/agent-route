"""Pydantic schemas for market intelligence data (news, announcements, etc.)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class NewsBase(BaseModel):
    """Base schema for financial news."""
    title: str = Field(..., max_length=500)
    summary: Optional[str] = None
    publish_time: datetime
    source: str = Field(..., max_length=100)
    url: str = Field(..., max_length=1000)
    category: str = Field("news", max_length=50)
    related_stocks: Optional[List[str]] = None


class NewsCreate(NewsBase):
    """Schema for creating news."""
    content: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None


class NewsSchema(NewsBase):
    """Schema for news retrieved from DB."""
    id: UUID
    content: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AnnouncementBase(BaseModel):
    """Base schema for company announcements."""
    title: str = Field(..., max_length=500)
    publish_time: datetime
    stock_symbol: str = Field(..., max_length=20)
    url: str = Field(..., max_length=1000)
    ann_type: Optional[str] = Field(None, max_length=100)


class AnnouncementCreate(AnnouncementBase):
    """Schema for creating an announcement."""
    content: Optional[str] = None
    file_path: Optional[str] = None
    raw_content: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None


class AnnouncementSchema(AnnouncementBase):
    """Schema for announcement retrieved from DB."""
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ResearchReportBase(BaseModel):
    """Base schema for research reports."""
    title: str = Field(..., max_length=500)
    summary: Optional[str] = None
    publish_time: datetime
    author: Optional[str] = None
    institution: Optional[str] = None
    stock_symbol: Optional[str] = None
    category: str = Field("report", max_length=50)
    url: str = Field(..., max_length=1000)


class FundFlowBase(BaseModel):
    """Schema for fund flow data."""
    symbol: str
    name: str
    trade_date: datetime
    main_net_inflow: float
    main_net_inflow_pct: float
    super_large_inflow: float
    large_inflow: float
    medium_inflow: float
    small_inflow: float
