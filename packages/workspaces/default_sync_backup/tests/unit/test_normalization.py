"""Unit tests for the normalization layer."""

import pytest
from decimal import Decimal
from datetime import date

from libs.normalization.manager import NormalizationManager
from libs.normalization.transformer import BaseTransformer
from libs.schemas.market_data import DailyBar


def test_symbol_transformation():
    assert BaseTransformer.transform_symbol("600000.SH") == "600000.XSHG"
    assert BaseTransformer.transform_symbol("000001.SZ") == "000001.XSHE"
    assert BaseTransformer.transform_symbol("430001.BJ") == "430001.XBSE"
    assert BaseTransformer.transform_symbol("600001.SS") == "600001.XSHG"
    assert BaseTransformer.transform_symbol("000002") == "000002.XSHE"
    assert BaseTransformer.transform_symbol("600003") == "600003.XSHG"


def test_wind_normalization():
    manager = NormalizationManager()
    raw_wind = {
        "wind_code": "600000.SH",
        "trade_date": "20231027",
        "open": 10.5,
        "high": 11.0,
        "low": 10.0,
        "close": 10.8,
        "volume": 1000000,
        "amt": 10500000,
    }
    multi_raw = {"wind": raw_wind}
    normalized = manager.normalize_market_data(multi_raw)
    
    assert isinstance(normalized, DailyBar)
    assert normalized.symbol == "600000.XSHG"
    assert normalized.date == date(2023, 10, 27)
    assert normalized.close == Decimal("10.8")


def test_tushare_normalization():
    manager = NormalizationManager()
    raw_tushare = {
        "ts_code": "000001.SZ",
        "trade_date": "2023-10-27",
        "open": 14.5,
        "high": 15.0,
        "low": 14.0,
        "close": 14.8,
        "vol": 5000,
        "amount": 74000,
    }
    multi_raw = {"tushare": raw_tushare}
    normalized = manager.normalize_market_data(multi_raw)
    
    assert normalized.symbol == "000001.XSHE"
    assert normalized.close == Decimal("14.8")
    assert normalized.amount == Decimal("74000000") # 74000 * 1000


def test_conflict_resolution_market_data():
    manager = NormalizationManager()
    raw_wind = {
        "wind_code": "600000.SH",
        "trade_date": "20231027",
        "open": 10.5,
        "high": 11.0,
        "low": 10.0,
        "close": 10.8, # Wind says 10.8
        "volume": 1000000,
        "amt": 10500000,
    }
    raw_tushare = {
        "ts_code": "600000.SH",
        "trade_date": "20231027",
        "open": 10.5,
        "high": 11.0,
        "low": 10.0,
        "close": 10.7, # Tushare says 10.7
        "vol": 10000,
        "amount": 105000,
    }
    
    # Wind has higher priority for market data
    multi_raw = {"wind": raw_wind, "tushare": raw_tushare}
    normalized = manager.normalize_market_data(multi_raw)
    assert normalized.close == Decimal("10.8")
    
    # Even if tushare is first in dict, Wind should win if both present
    multi_raw_reversed = {"tushare": raw_tushare, "wind": raw_wind}
    normalized_reversed = manager.normalize_market_data(multi_raw_reversed)
    assert normalized_reversed.close == Decimal("10.8")


def test_financial_normalization_priority():
    manager = NormalizationManager()
    raw_wind = {
        "code": "600000.SH",
        "end_date": "20230930",
        "w_tot_rev": 1000000,
        "w_rev": 900000,
        "w_tot_cost": 800000,
        "w_oper_cost": 700000,
        "w_oper_profit": 200000,
        "w_tot_profit": 210000,
        "w_net_profit": 160000,
        "w_np_parent": 150000,
        "report_type": "Q3"
    }
    raw_tushare = {
        "ts_code": "600000.SH",
        "end_date": "2023-09-30",
        "total_revenue": 1000001, # Tushare says 1000001
        "revenue": 900001,
        "total_cogs": 800001,
        "oper_cost": 700001,
        "operate_profit": 200001,
        "total_profit": 210001,
        "net_profit": 160001,
        "n_income_attr_p": 150001,
        "report_type": "Q3"
    }
    
    # Tushare has higher priority for financial data
    multi_raw = {"wind": raw_wind, "tushare": raw_tushare}
    normalized = manager.normalize_income_statement(multi_raw)
    assert normalized.total_revenue == Decimal("1000001")
