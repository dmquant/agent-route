"""Manager for multi-source data normalization and conflict resolution."""

import logging
from typing import Any, Dict, List, Optional, Type, Union

from pydantic import BaseModel

from libs.normalization.eastmoney import EastMoneyTransformer
from libs.normalization.transformer import BaseTransformer
from libs.normalization.tushare import TushareTransformer
from libs.normalization.wind import WindTransformer
from libs.schemas.financial_data import (
    BalanceSheet,
    CashFlowStatement,
    FinancialIndicators,
    IncomeStatement,
)
from libs.schemas.market_data import DailyBar, RealtimeQuote

logger = logging.getLogger(__name__)


class NormalizationManager:
    """
    Manages data normalization from multiple sources with priority-based conflict resolution.
    """

    # Priority rules: higher index means higher priority
    # Market Data: EastMoney < Tushare < Wind
    MARKET_DATA_PRIORITY = ["eastmoney", "tushare", "wind"]
    # Financial Data: EastMoney < Wind < Tushare
    FINANCIAL_DATA_PRIORITY = ["eastmoney", "wind", "tushare"]

    def __init__(self):
        self.transformers: Dict[str, BaseTransformer] = {
            "wind": WindTransformer(),
            "tushare": TushareTransformer(),
            "eastmoney": EastMoneyTransformer(),
        }

    def normalize_market_data(self, multi_source_raw: Dict[str, Dict[str, Any]]) -> DailyBar:
        """
        Normalize market data from multiple sources.
        :param multi_source_raw: Dict mapping source name to raw data dict.
        """
        final_data = None
        for source in self.MARKET_DATA_PRIORITY:
            if source in multi_source_raw:
                try:
                    raw = multi_source_raw[source]
                    transformer = self.transformers[source]
                    normalized = transformer.to_daily_bar(raw)
                    # For market data, we take the highest priority source that provides valid data
                    final_data = normalized
                except Exception as e:
                    logger.warning(f"Failed to normalize market data from {source}: {e}")

        if not final_data:
            raise ValueError("No valid market data provided from any source.")
        return final_data

    def normalize_income_statement(
        self, multi_source_raw: Dict[str, Dict[str, Any]]
    ) -> IncomeStatement:
        """Normalize income statement with priority rules."""
        return self._normalize_with_priority(
            multi_source_raw, self.FINANCIAL_DATA_PRIORITY, "to_income_statement"
        )

    def normalize_balance_sheet(self, multi_source_raw: Dict[str, Dict[str, Any]]) -> BalanceSheet:
        """Normalize balance sheet with priority rules."""
        return self._normalize_with_priority(
            multi_source_raw, self.FINANCIAL_DATA_PRIORITY, "to_balance_sheet"
        )

    def normalize_cash_flow(self, multi_source_raw: Dict[str, Dict[str, Any]]) -> CashFlowStatement:
        """Normalize cash flow with priority rules."""
        return self._normalize_with_priority(
            multi_source_raw, self.FINANCIAL_DATA_PRIORITY, "to_cash_flow_statement"
        )

    def _normalize_with_priority(
        self, multi_source_raw: Dict[str, Dict[str, Any]], priority_list: List[str], method_name: str
    ) -> Any:
        final_data = None
        for source in priority_list:
            if source in multi_source_raw:
                try:
                    raw = multi_source_raw[source]
                    transformer = self.transformers[source]
                    method = getattr(transformer, method_name)
                    normalized = method(raw)
                    # Override with higher priority
                    final_data = normalized
                except Exception as e:
                    logger.warning(f"Failed to normalize using {method_name} from {source}: {e}")

        if not final_data:
            raise ValueError(f"No valid data provided for {method_name} from any source.")
        return final_data
