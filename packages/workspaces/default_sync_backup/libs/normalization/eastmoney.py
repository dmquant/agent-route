"""EastMoney specific data transformer."""

from typing import Any, Dict

from libs.normalization.transformer import BaseTransformer
from libs.schemas.financial_data import (
    BalanceSheet,
    CashFlowStatement,
    FinancialIndicators,
    IncomeStatement,
)
from libs.schemas.market_data import DailyBar, RealtimeQuote


class EastMoneyTransformer(BaseTransformer):
    """Transformer for EastMoney (东方财富) data source."""

    def to_daily_bar(self, raw: Dict[str, Any]) -> DailyBar:
        return DailyBar(
            symbol=self.transform_symbol(raw.get("f12", "")),
            date=self.transform_date(raw.get("f124", "")),
            open=self.transform_decimal(raw.get("f17")),
            high=self.transform_decimal(raw.get("f15")),
            low=self.transform_decimal(raw.get("f16")),
            close=self.transform_decimal(raw.get("f2")),
            volume=self.transform_decimal(raw.get("f5")),
            amount=self.transform_decimal(raw.get("f6")),
            adj_factor=self.transform_decimal(raw.get("adj", 1.0)),
        )

    def to_realtime_quote(self, raw: Dict[str, Any]) -> RealtimeQuote:
        return RealtimeQuote(
            symbol=self.transform_symbol(raw.get("f12", "")),
            date=self.transform_date(raw.get("f124", "")),
            time=raw.get("f125"),
            open=self.transform_decimal(raw.get("f17")),
            high=self.transform_decimal(raw.get("f15")),
            low=self.transform_decimal(raw.get("f16")),
            last=self.transform_decimal(raw.get("f2")),
            volume=self.transform_decimal(raw.get("f5")),
            amount=self.transform_decimal(raw.get("f6")),
            prev_close=self.transform_decimal(raw.get("f18")),
        )

    def to_income_statement(self, raw: Dict[str, Any]) -> IncomeStatement:
        return IncomeStatement(
            symbol=self.transform_symbol(raw.get("SECURITY_CODE", "")),
            end_date=self.transform_date(raw.get("REPORT_DATE")),
            publish_date=self.transform_date(raw.get("NOTICE_DATE")),
            report_type=raw.get("REPORT_TYPE", "Unknown"),
            total_revenue=self.transform_decimal(raw.get("TOTAL_OPERATE_INCOME")),
            revenue=self.transform_decimal(raw.get("OPERATE_INCOME")),
            total_cost=self.transform_decimal(raw.get("TOTAL_OPERATE_COST")),
            operating_cost=self.transform_decimal(raw.get("OPERATE_COST")),
            operating_profit=self.transform_decimal(raw.get("OPERATE_PROFIT")),
            total_profit=self.transform_decimal(raw.get("TOTAL_PROFIT")),
            net_profit=self.transform_decimal(raw.get("NETPROFIT")),
            net_profit_attr_parent=self.transform_decimal(raw.get("PARENT_NETPROFIT")),
        )

    def to_balance_sheet(self, raw: Dict[str, Any]) -> BalanceSheet:
        return BalanceSheet(
            symbol=self.transform_symbol(raw.get("SECURITY_CODE", "")),
            end_date=self.transform_date(raw.get("REPORT_DATE")),
            publish_date=self.transform_date(raw.get("NOTICE_DATE")),
            report_type=raw.get("REPORT_TYPE", "Unknown"),
            total_assets=self.transform_decimal(raw.get("TOTAL_ASSETS")),
            total_liabilities=self.transform_decimal(raw.get("TOTAL_LIABILITIES")),
            total_equity=self.transform_decimal(raw.get("TOTAL_EQUITY")),
            total_equity_attr_parent=self.transform_decimal(raw.get("PARENT_EQUITY")),
            current_assets=self.transform_decimal(raw.get("TOTAL_CURRENT_ASSETS")),
            non_current_assets=self.transform_decimal(raw.get("TOTAL_NONCURRENT_ASSETS")),
            current_liabilities=self.transform_decimal(raw.get("TOTAL_CURRENT_LIAB")),
            non_current_liabilities=self.transform_decimal(raw.get("TOTAL_NONCURRENT_LIAB")),
        )

    def to_cash_flow_statement(self, raw: Dict[str, Any]) -> CashFlowStatement:
        return CashFlowStatement(
            symbol=self.transform_symbol(raw.get("SECURITY_CODE", "")),
            end_date=self.transform_date(raw.get("REPORT_DATE")),
            publish_date=self.transform_date(raw.get("NOTICE_DATE")),
            report_type=raw.get("REPORT_TYPE", "Unknown"),
            net_cash_flow_operating=self.transform_decimal(raw.get("NET_CASH_FLOW_OPER")),
            net_cash_flow_investing=self.transform_decimal(raw.get("NET_CASH_FLOW_INV")),
            net_cash_flow_financing=self.transform_decimal(raw.get("NET_CASH_FLOW_FIN")),
            net_cash_flow=self.transform_decimal(raw.get("NET_CASH_FLOW")),
        )

    def to_financial_indicators(self, raw: Dict[str, Any]) -> FinancialIndicators:
        return FinancialIndicators(
            symbol=self.transform_symbol(raw.get("SECURITY_CODE", "")),
            end_date=self.transform_date(raw.get("REPORT_DATE")),
            publish_date=self.transform_date(raw.get("NOTICE_DATE")),
            report_type=raw.get("REPORT_TYPE", "Unknown"),
            eps=self.transform_decimal(raw.get("BASIC_EPS")),
            roe=self.transform_decimal(raw.get("WEIGHTAVG_ROE")),
            roa=self.transform_decimal(raw.get("ROA")),
            net_profit_margin=self.transform_decimal(raw.get("NETPROFIT_MARGIN")),
            gross_profit_margin=self.transform_decimal(raw.get("GROSS_PROFIT_MARGIN")),
            asset_liability_ratio=self.transform_decimal(raw.get("DEBT_ASSET_RATIO")),
        )
