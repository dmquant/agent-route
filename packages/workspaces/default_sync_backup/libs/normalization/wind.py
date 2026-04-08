"""Wind specific data transformer."""

from typing import Any, Dict

from libs.normalization.transformer import BaseTransformer
from libs.schemas.financial_data import (
    BalanceSheet,
    CashFlowStatement,
    FinancialIndicators,
    IncomeStatement,
)
from libs.schemas.market_data import DailyBar, RealtimeQuote


class WindTransformer(BaseTransformer):
    """Transformer for Wind (万得) data source."""

    def to_daily_bar(self, raw: Dict[str, Any]) -> DailyBar:
        return DailyBar(
            symbol=self.transform_symbol(raw.get("wind_code", "")),
            date=self.transform_date(raw.get("trade_date", "")),
            open=self.transform_decimal(raw.get("open")),
            high=self.transform_decimal(raw.get("high")),
            low=self.transform_decimal(raw.get("low")),
            close=self.transform_decimal(raw.get("close")),
            volume=self.transform_decimal(raw.get("volume")),
            amount=self.transform_decimal(raw.get("amt")),
            adj_factor=self.transform_decimal(raw.get("adj", 1.0)),
        )

    def to_realtime_quote(self, raw: Dict[str, Any]) -> RealtimeQuote:
        # Implementation for real-time quote
        return RealtimeQuote(
            symbol=self.transform_symbol(raw.get("rt_code", "")),
            date=self.transform_date(raw.get("rt_date", "")),
            time=raw.get("rt_time"),
            open=self.transform_decimal(raw.get("rt_open")),
            high=self.transform_decimal(raw.get("rt_high")),
            low=self.transform_decimal(raw.get("rt_low")),
            last=self.transform_decimal(raw.get("rt_last")),
            volume=self.transform_decimal(raw.get("rt_vol")),
            amount=self.transform_decimal(raw.get("rt_amt")),
            prev_close=self.transform_decimal(raw.get("rt_pre_close")),
        )

    def to_income_statement(self, raw: Dict[str, Any]) -> IncomeStatement:
        return IncomeStatement(
            symbol=self.transform_symbol(raw.get("code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("pub_date")),
            report_type=raw.get("report_type", "Unknown"),
            total_revenue=self.transform_decimal(raw.get("w_tot_rev")),
            revenue=self.transform_decimal(raw.get("w_rev")),
            total_cost=self.transform_decimal(raw.get("w_tot_cost")),
            operating_cost=self.transform_decimal(raw.get("w_oper_cost")),
            operating_profit=self.transform_decimal(raw.get("w_oper_profit")),
            total_profit=self.transform_decimal(raw.get("w_tot_profit")),
            net_profit=self.transform_decimal(raw.get("w_net_profit")),
            net_profit_attr_parent=self.transform_decimal(raw.get("w_np_parent")),
        )

    def to_balance_sheet(self, raw: Dict[str, Any]) -> BalanceSheet:
        return BalanceSheet(
            symbol=self.transform_symbol(raw.get("code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("pub_date")),
            report_type=raw.get("report_type", "Unknown"),
            total_assets=self.transform_decimal(raw.get("w_tot_assets")),
            total_liabilities=self.transform_decimal(raw.get("w_tot_liab")),
            total_equity=self.transform_decimal(raw.get("w_tot_equity")),
            total_equity_attr_parent=self.transform_decimal(raw.get("w_eq_parent")),
            current_assets=self.transform_decimal(raw.get("w_curr_assets")),
            non_current_assets=self.transform_decimal(raw.get("w_noncurr_assets")),
            current_liabilities=self.transform_decimal(raw.get("w_curr_liab")),
            non_current_liabilities=self.transform_decimal(raw.get("w_noncurr_liab")),
        )

    def to_cash_flow_statement(self, raw: Dict[str, Any]) -> CashFlowStatement:
        return CashFlowStatement(
            symbol=self.transform_symbol(raw.get("code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("pub_date")),
            report_type=raw.get("report_type", "Unknown"),
            net_cash_flow_operating=self.transform_decimal(raw.get("w_ncf_oper")),
            net_cash_flow_investing=self.transform_decimal(raw.get("w_ncf_inv")),
            net_cash_flow_financing=self.transform_decimal(raw.get("w_ncf_fin")),
            net_cash_flow=self.transform_decimal(raw.get("w_ncf_net")),
        )

    def to_financial_indicators(self, raw: Dict[str, Any]) -> FinancialIndicators:
        return FinancialIndicators(
            symbol=self.transform_symbol(raw.get("code", "")),
            end_date=self.transform_date(raw.get("end_date")),
            publish_date=self.transform_date(raw.get("pub_date")),
            report_type=raw.get("report_type", "Unknown"),
            eps=self.transform_decimal(raw.get("w_eps")),
            roe=self.transform_decimal(raw.get("w_roe")),
            roa=self.transform_decimal(raw.get("w_roa")),
            net_profit_margin=self.transform_decimal(raw.get("w_npm")),
            gross_profit_margin=self.transform_decimal(raw.get("w_gpm")),
            asset_liability_ratio=self.transform_decimal(raw.get("w_al_ratio")),
        )
