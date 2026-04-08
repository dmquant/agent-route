"""Pydantic schemas for market data and sync status."""

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from datetime import time as dt_time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class DailyBar(BaseModel):
    """Internal schema for a daily K-line bar."""

    symbol: str = Field(..., description="Stock symbol (e.g., '000001.SZ')")
    date: dt_date = Field(..., description="Trading date")
    open: Decimal = Field(..., description="Opening price")
    high: Decimal = Field(..., description="Highest price")
    low: Decimal = Field(..., description="Lowest price")
    close: Decimal = Field(..., description="Closing price")
    volume: Decimal = Field(..., description="Trading volume")
    amount: Decimal = Field(..., description="Trading amount")
    adj_factor: Decimal = Field(default=Decimal("1.0"), description="Cumulative adjustment factor")


class RealtimeQuote(BaseModel):
    """Internal schema for a real-time market snapshot."""

    symbol: str = Field(..., description="Stock symbol")
    date: dt_date = Field(..., description="Trading date")
    time: dt_time = Field(..., description="Trading time")
    open: Decimal = Field(..., description="Opening price")
    high: Decimal = Field(..., description="Highest price")
    low: Decimal = Field(..., description="Lowest price")
    last: Decimal = Field(..., description="Current/Last price")
    volume: Decimal = Field(..., description="Trading volume")
    amount: Decimal = Field(..., description="Trading amount")
    prev_close: Decimal = Field(..., description="Previous closing price")


class StockInfo(BaseModel):
    """Schema for stock basic information."""

    symbol: str
    name: str
    exchange: str
    sector: Optional[str] = None
    list_date: Optional[dt_date] = None


class SyncStatus(BaseModel):
    """Status report for the data connector."""

    service_name: str = "wind_connector"
    is_connected: bool
    last_sync_time: Optional[dt_datetime] = None
    total_stocks: int = 0
    synced_stocks: int = 0
    error_count: int = 0
    last_error: Optional[str] = None
    uptime_seconds: float


class FinancialStatementSchema(BaseModel):
    """Schema for a financial statement record."""

    symbol: str
    report_date: dt_date
    statement_type: str
    data: dict


class AnnouncementSchema(BaseModel):
    """Schema for a company announcement."""

    symbol: str
    title: str
    publish_date: dt_datetime
    ann_type: Optional[str] = None
    url: Optional[str] = None
    id: Optional[str] = None


class NewsSchema(BaseModel):
    """Schema for a news item."""

    title: str
    content: Optional[str] = None
    publish_time: dt_datetime
    source: str
    url: Optional[str] = None
    category: str = "news"
    related_stocks: Optional[list[str]] = None


class IncomeSheetSchema(BaseModel):
    """Schema for income statement data."""

    symbol: str
    ann_date: dt_date
    end_date: dt_date
    report_type: str
    revenue: Optional[Decimal] = None
    n_income: Optional[Decimal] = None
    n_income_attr_p: Optional[Decimal] = None


class BalanceSheetSchema(BaseModel):
    """Schema for balance sheet data."""

    symbol: str
    ann_date: dt_date
    end_date: dt_date
    report_type: str
    total_assets: Optional[Decimal] = None
    total_liab: Optional[Decimal] = None
    total_hals_attr_p: Optional[Decimal] = None


class CashFlowSchema(BaseModel):
    """Schema for cash flow statement data."""

    symbol: str
    ann_date: dt_date
    end_date: dt_date
    report_type: str
    net_cash_flows_oper_act: Optional[Decimal] = None
    net_cash_flows_inv_act: Optional[Decimal] = None
    net_cash_flows_fnc_act: Optional[Decimal] = None


class IndexComponentSchema(BaseModel):
    """Schema for index component data."""

    index_symbol: str
    stock_symbol: str
    trade_date: dt_date
    weight: Optional[Decimal] = None


class DividendSchema(BaseModel):
    """Schema for dividend data."""

    symbol: str
    ann_date: dt_date
    end_date: dt_date
    ex_date: Optional[dt_date] = None
    pay_date: Optional[dt_date] = None
    cash_div_tax: Optional[Decimal] = None
    bonus_share: Optional[Decimal] = None
