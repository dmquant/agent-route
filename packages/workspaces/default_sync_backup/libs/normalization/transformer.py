"""Base classes for data transformation and normalization."""

import re
from abc import ABC, abstractmethod
from datetime import date as dt_date
from datetime import datetime as dt_datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Type, TypeVar, Union

from pydantic import BaseModel

from libs.schemas.financial_data import (
    BalanceSheet,
    CashFlowStatement,
    FinancialIndicators,
    IncomeStatement,
)
from libs.schemas.market_data import DailyBar, RealtimeQuote

T = TypeVar("T", bound=BaseModel)


class BaseTransformer(ABC):
    """
    Abstract base class for all data source transformers.
    Provides common logic for symbol, date, and price standardization.
    """

    @staticmethod
    def transform_symbol(symbol: str) -> str:
        """
        Standardize stock symbols.
        Examples:
        - 600000.SH -> 600000.XSHG
        - 000001.SZ -> 000001.XSHE
        - 430001.BJ -> 430001.XBSE
        """
        if not symbol:
            return ""

        # Remove common prefixes/suffixes like 'SH', 'SZ', 'SS', 'XSHG'
        # Regularize to 'code.SUFFIX'
        match = re.match(r"(\d{6})\.?([A-Z]+)?", symbol.upper())
        if not match:
            return symbol

        code, suffix = match.groups()

        # Mapping for common suffixes
        suffix_map = {
            "SH": "XSHG",
            "SS": "XSHG",
            "XSHG": "XSHG",
            "SZ": "XSHE",
            "XSHE": "XSHE",
            "BJ": "XBSE",
            "BSE": "XBSE",
            "XBSE": "XBSE",
        }

        # Heuristic if suffix is missing
        if not suffix:
            if code.startswith(("6", "9")):
                suffix = "XSHG"
            elif code.startswith(("0", "2", "3")):
                suffix = "XSHE"
            elif code.startswith(("4", "8")):
                suffix = "XBSE"
            else:
                suffix = "UNKNOWN"
        else:
            suffix = suffix_map.get(suffix, suffix)

        return f"{code}.{suffix}"

    @staticmethod
    def transform_date(date_val: Any) -> Optional[dt_date]:
        """Standardize date to datetime.date object."""
        if date_val is None or date_val == "":
            return None
        if isinstance(date_val, dt_date):
            return date_val
        if isinstance(date_val, dt_datetime):
            return date_val.date()
        if isinstance(date_val, str):
            # Try common formats
            for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y/%m/%d"):
                try:
                    return dt_datetime.strptime(date_val, fmt).date()
                except ValueError:
                    continue
        raise ValueError(f"Unable to parse date: {date_val}")

    @staticmethod
    def transform_decimal(val: Any) -> Decimal:
        """Standardize to Decimal."""
        if val is None:
            return Decimal("0")
        try:
            return Decimal(str(val))
        except (ValueError, TypeError):
            return Decimal("0")

    @abstractmethod
    def to_daily_bar(self, raw: Dict[str, Any]) -> DailyBar:
        """Transform raw data to standard DailyBar."""
        pass

    @abstractmethod
    def to_realtime_quote(self, raw: Dict[str, Any]) -> RealtimeQuote:
        """Transform raw data to standard RealtimeQuote."""
        pass

    @abstractmethod
    def to_income_statement(self, raw: Dict[str, Any]) -> IncomeStatement:
        """Transform raw data to standard IncomeStatement."""
        pass

    @abstractmethod
    def to_balance_sheet(self, raw: Dict[str, Any]) -> BalanceSheet:
        """Transform raw data to standard BalanceSheet."""
        pass

    @abstractmethod
    def to_cash_flow_statement(self, raw: Dict[str, Any]) -> CashFlowStatement:
        """Transform raw data to standard CashFlowStatement."""
        pass

    @abstractmethod
    def to_financial_indicators(self, raw: Dict[str, Any]) -> FinancialIndicators:
        """Transform raw data to standard FinancialIndicators."""
        pass
