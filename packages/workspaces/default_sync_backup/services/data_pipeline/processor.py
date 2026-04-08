"""Data cleaning and transformation logic for market data."""

from datetime import date as dt_date
from decimal import Decimal
from typing import Any, Optional

import structlog
from pydantic import ValidationError

from libs.schemas.market_data import DailyBar, RealtimeQuote

logger = structlog.get_logger(__name__)


class MarketDataProcessor:
    """Handles cleaning and standardizing raw market data messages."""

    def __init__(self) -> None:
        self._processed_ids: set[str] = set()
        self._max_cache_size = 10000

    def clean_daily_bar(self, raw_data: dict[str, Any]) -> Optional[DailyBar]:
        """Clean and validate a raw daily bar message."""
        try:
            # Basic deduplication based on symbol and date
            msg_id = f"{raw_data.get('symbol')}_{raw_data.get('date')}"
            if msg_id in self._processed_ids:
                logger.debug("duplicate_msg_skipped", msg_id=msg_id)
                return None

            # Type conversion and null handling
            # Assuming raw_data might have string values for Decimals
            cleaned = {
                "symbol": str(raw_data["symbol"]),
                "date": self._parse_date(raw_data["date"]),
                "open": self._to_decimal(raw_data.get("open", 0)),
                "high": self._to_decimal(raw_data.get("high", 0)),
                "low": self._to_decimal(raw_data.get("low", 0)),
                "close": self._to_decimal(raw_data.get("close", 0)),
                "volume": self._to_decimal(raw_data.get("volume", 0)),
                "amount": self._to_decimal(raw_data.get("amount", 0)),
                "adj_factor": self._to_decimal(raw_data.get("adj_factor", 1)),
            }

            bar = DailyBar(**cleaned)
            
            # Update deduplication cache
            self._processed_ids.add(msg_id)
            if len(self._processed_ids) > self._max_cache_size:
                # Simple LRU-ish: clear half when full
                self._processed_ids = set(list(self._processed_ids)[self._max_cache_size // 2 :])

            return bar

        except (KeyError, ValueError, ValidationError) as e:
            logger.error("market_data_cleaning_failed", error=str(e), raw_data=raw_data)
            return None

    def _parse_date(self, value: Any) -> dt_date:
        """Parse date from various formats."""
        if isinstance(value, dt_date):
            return value
        if isinstance(value, str):
            return dt_date.fromisoformat(value)
        raise ValueError(f"Invalid date format: {value}")

    def _to_decimal(self, value: Any) -> Decimal:
        """Convert value to Decimal, handling None/NaN."""
        if value is None:
            return Decimal("0")
        try:
            return Decimal(str(value))
        except (ValueError, TypeError):
            return Decimal("0")
