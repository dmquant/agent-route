"""Tushare specific data transformer."""

from typing import Any, Dict

from libs.normalization.transformer import BaseTransformer
from libs.schemas.financial_data import (
    BalanceSheet,
    CashFlowStatement,
    FinancialIndicators,
    IncomeStatement,
)
from libs.schemas.market_data import DailyBar, RealtimeQuote


class TushareTransformer(BaseTransformer):
    """Transformer for Tushare (挖地兔) data source."""

    def to_daily_bar(self, raw: Dict[str, Any]) -> DailyBar:
        return DailyBar(
            symbol=self.transform_symbol(raw.get("ts_code", "")),
            date=self.transform_date(raw.get("trade_date", "")),
            open=self.transform_decimal(raw.get("open")),
            high=self.transform_decimal(raw.get("high")),
            low=self.transform_decimal(raw.get("low")),
            close=self.transform_decimal(raw.get("close")),
            volume=self.transform_decimal(raw.get("vol")),  # Tushare uses 'vol' in lots usually
            amount=self.transform_decimal(raw.get("amount")) * 1000,  # Tushare amount is in k-yuan usually
            adj_factor=self.transform_decimal(raw.get("adj_factor", 1.0)),
        )

    def to_realtime_quote(self, raw: Dict[str, Any]) -> RealtimeQuote:
        return RealtimeQuote(
            symbol=self.transform_symbol(raw.get("ts_code", "")),
            date=self.transform_date(raw.get("date", "")),
            time=raw.get("time"),
            open=self.transform_decimal(raw.get("open")),
            high=self.transform_decimal(raw.get("high")),
            low=self.transform_decimal(raw.get("low")),
            last=self.transform_decimal(raw.get("price")),
            volume=self.transform_decimal(raw.get("volume")),
            amount=self.transform_decimal(raw.get("amount")),
            prev_close=self.transform_decimal(raw.get("pre_close")),
        )

    def to_income_statement(self, raw: Dict[str, Any]) -> IncomeStatement:
        return IncomeStatement(
            symbol=self.transform_symbol(raw.get("ts_code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("ann_date")),
            report_type=raw.get("report_type", "Unknown"),
            total_revenue=self.transform_decimal(raw.get("total_revenue")),
            revenue=self.transform_decimal(raw.get("revenue")),
            total_cost=self.transform_decimal(raw.get("total_cogs")),
            operating_cost=self.transform_decimal(raw.get("oper_cost")),
            operating_profit=self.transform_decimal(raw.get("operate_profit")),
            total_profit=self.transform_decimal(raw.get("total_profit")),
            net_profit=self.transform_decimal(raw.get("net_profit")),
            net_profit_attr_parent=self.transform_decimal(raw.get("n_income_attr_p")),
        )

    def to_balance_sheet(self, raw: Dict[str, Any]) -> BalanceSheet:
        return BalanceSheet(
            symbol=self.transform_symbol(raw.get("ts_code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("ann_date")),
            report_type=raw.get("report_type", "Unknown"),
            total_assets=self.transform_decimal(raw.get("total_assets")),
            total_liabilities=self.transform_decimal(raw.get("total_liab")),
            total_equity=self.transform_decimal(raw.get("total_hldr_eqy_exc_min_int")),
            total_equity_attr_parent=self.transform_decimal(raw.get("total_hldr_eqy_inc_min_int")),
            current_assets=self.transform_decimal(raw.get("total_cur_assets")),
            non_current_assets=self.transform_decimal(raw.get("total_nca")),
            current_liabilities=self.transform_decimal(raw.get("total_cur_liab")),
            non_current_liabilities=self.transform_decimal(raw.get("total_ncl")),
        )

    def to_cash_flow_statement(self, raw: Dict[str, Any]) -> CashFlowStatement:
        return CashFlowStatement(
            symbol=self.transform_symbol(raw.get("ts_code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("ann_date")),
            report_type=raw.get("report_type", "Unknown"),
            net_cash_flow_operating=self.transform_decimal(raw.get("n_cashflow_act")),
            net_cash_flow_investing=self.transform_decimal(raw.get("n_cashflow_inv_act")),
            net_cash_flow_financing=self.transform_decimal(raw.get("n_cash_flows_fina_act")),
            net_cash_flow=self.transform_decimal(raw.get("n_incr_cash_cash_equ")),
        )

    def to_financial_indicators(self, raw: Dict[str, Any]) -> FinancialIndicators:
        return FinancialIndicators(
            symbol=self.transform_symbol(raw.get("ts_code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("ann_date")),
            report_type=raw.get("report_type", "Unknown"),
            eps=self.transform_decimal(raw.get("eps")),
            roe=self.transform_decimal(raw.get("roe")),
            roa=self.transform_decimal(raw.get("roa")),
            net_profit_margin=self.transform_decimal(raw.get("netprofit_margin")),
            gross_profit_margin=self.transform_decimal(raw.get("gpm")),
            asset_liability_ratio=self.transform_decimal(raw.get("debt_to_assets")),
        )
