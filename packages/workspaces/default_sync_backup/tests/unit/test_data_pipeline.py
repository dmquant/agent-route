"""Unit tests for the market data processor."""

from datetime import date
from decimal import Decimal

from services.data_pipeline.processor import MarketDataProcessor


def test_clean_daily_bar_valid():
    """Test cleaning a valid raw daily bar message."""
    processor = MarketDataProcessor()
    raw_data = {
        "symbol": "000001.SZ",
        "date": "2024-01-01",
        "open": "10.5",
        "high": 11.0,
        "low": "10.0",
        "close": 10.8,
        "volume": 1000000,
        "amount": 10500000,
        "adj_factor": 1.0,
    }
    
    bar = processor.clean_daily_bar(raw_data)
    
    assert bar is not None
    assert bar.symbol == "000001.SZ"
    assert bar.date == date(2024, 1, 1)
    assert bar.open == Decimal("10.5")
    assert bar.volume == Decimal("1000000")


def test_clean_daily_bar_deduplication():
    """Test that duplicate messages are skipped."""
    processor = MarketDataProcessor()
    raw_data = {
        "symbol": "000001.SZ",
        "date": "2024-01-01",
        "open": 10.5,
    }
    
    # First time - success
    bar1 = processor.clean_daily_bar(raw_data)
    assert bar1 is not None
    
    # Second time - duplicate skip
    bar2 = processor.clean_daily_bar(raw_data)
    assert bar2 is None


def test_clean_daily_bar_invalid_date():
    """Test handling invalid date formats."""
    processor = MarketDataProcessor()
    raw_data = {
        "symbol": "000001.SZ",
        "date": "invalid-date",
        "open": 10.5,
    }
    
    bar = processor.clean_daily_bar(raw_data)
    assert bar is None


def test_clean_daily_bar_missing_fields():
    """Test filling defaults for missing fields."""
    processor = MarketDataProcessor()
    raw_data = {
        "symbol": "000001.SZ",
        "date": "2024-01-01",
        # open is missing
    }
    
    bar = processor.clean_daily_bar(raw_data)
    assert bar is not None
    assert bar.open == Decimal("0")
