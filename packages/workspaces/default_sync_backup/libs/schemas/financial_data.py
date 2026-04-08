"""Pydantic schemas for standardized financial report data."""

from datetime import date as dt_date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class FinancialStatementBase(BaseModel):
    """Base model for all financial statements."""

    symbol: str = Field(..., description="Standardized stock symbol (e.g., '600000.XSHG')")
    end_date: dt_date = Field(..., description="Report period end date")
    publish_date: Optional[dt_date] = Field(None, description="Actual publication date")
    report_type: str = Field(..., description="Type of report: Q1, Q2, Q3, Q4, Yearly, etc.")


class IncomeStatement(FinancialStatementBase):
    """Internal standardized income statement model."""

    total_revenue: Decimal = Field(..., description="营业总收入")
    revenue: Decimal = Field(..., description="营业收入")
    total_cost: Decimal = Field(..., description="营业总成本")
    operating_cost: Decimal = Field(..., description="营业成本")
    operating_profit: Decimal = Field(..., description="营业利润")
    total_profit: Decimal = Field(..., description="利润总额")
    net_profit: Decimal = Field(..., description="净利润")
    net_profit_attr_parent: Decimal = Field(..., description="归属于母公司所有者的净利润")


class BalanceSheet(FinancialStatementBase):
    """Internal standardized balance sheet model."""

    total_assets: Decimal = Field(..., description="资产总计")
    total_liabilities: Decimal = Field(..., description="负债合计")
    total_equity: Decimal = Field(..., description="所有者权益合计")
    total_equity_attr_parent: Decimal = Field(..., description="归属于母公司所有者权益合计")
    current_assets: Optional[Decimal] = Field(None, description="流动资产合计")
    non_current_assets: Optional[Decimal] = Field(None, description="非流动资产合计")
    current_liabilities: Optional[Decimal] = Field(None, description="流动负债合计")
    non_current_liabilities: Optional[Decimal] = Field(None, description="非流动负债合计")


class CashFlowStatement(FinancialStatementBase):
    """Internal standardized cash flow statement model."""

    net_cash_flow_operating: Decimal = Field(..., description="经营活动产生的现金流量净额")
    net_cash_flow_investing: Decimal = Field(..., description="投资活动产生的现金流量净额")
    net_cash_flow_financing: Decimal = Field(..., description="筹资活动产生的现金流量净额")
    net_cash_flow: Decimal = Field(..., description="现金及现金等价物净增加额")


class FinancialIndicators(FinancialStatementBase):
    """Standardized key financial indicators."""

    eps: Decimal = Field(..., description="每股收益")
    roe: Decimal = Field(..., description="净资产收益率")
    roa: Decimal = Field(..., description="总资产收益率")
    net_profit_margin: Decimal = Field(..., description="销售净利率")
    gross_profit_margin: Decimal = Field(..., description="销售毛利率")
    asset_liability_ratio: Decimal = Field(..., description="资产负债率")
