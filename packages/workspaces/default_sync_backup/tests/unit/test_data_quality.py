import pytest
from pydantic import BaseModel, Field
from libs.data_quality.validator import DataValidator, SchemaRule
from libs.data_quality.rules import RangeRule, ZScoreOutlierRule
from libs.schemas.data_quality import ValidationReport

class MockMarketData(BaseModel):
    symbol: str = Field(..., min_length=1)
    price: float = Field(..., gt=0)
    volume: float

def test_schema_validation():
    """Test basic Pydantic schema validation through SchemaRule."""
    rule = SchemaRule(MockMarketData)
    
    # Valid data
    valid_data = {"symbol": "AAPL", "price": 150.0, "volume": 1000.0}
    res = rule.validate(valid_data)
    assert res.status == "PASS"
    
    # Invalid data (missing symbol)
    invalid_data = {"price": 150.0, "volume": 1000.0}
    res = rule.validate(invalid_data)
    assert res.status == "FAIL"
    assert "symbol" in str(res.details)

def test_range_rule():
    """Test numeric range constraints."""
    rule = RangeRule("price", min_val=0, max_val=1000)
    
    # Within range
    assert rule.validate({"price": 150.0}).status == "PASS"
    
    # Below range
    res = rule.validate({"price": -10.0})
    assert res.status == "FAIL"
    assert "below minimum" in res.message
    
    # Above range
    res = rule.validate({"price": 1500.0})
    assert res.status == "FAIL"
    assert "above maximum" in res.message

def test_z_score_outlier_rule():
    """Test statistical anomaly detection (Z-score)."""
    rule = ZScoreOutlierRule("price", threshold=3.0)
    
    # Normal data (Z-score = |150 - 145| / 10 = 0.5 < 3)
    context = {"mean": 145.0, "std_dev": 10.0}
    res = rule.validate({"price": 150.0}, context=context)
    assert res.status == "PASS"
    
    # Outlier (Z-score = |200 - 145| / 10 = 5.5 > 3)
    res = rule.validate({"price": 200.0}, context=context)
    assert res.status == "WARNING"
    assert "outlier" in res.message
    assert res.details["z_score"] == 5.5

def test_validator_overall_status():
    """Test that multiple rules combine correctly in the DataValidator."""
    validator = DataValidator("test_table")
    validator.add_rule(SchemaRule(MockMarketData))
    validator.add_rule(RangeRule("price", min_val=0))
    
    # All pass
    data = {"symbol": "TSLA", "price": 700.0, "volume": 50000.0}
    report = validator.validate(data)
    assert report.overall_status == "PASS"
    assert len(report.results) == 2
    
    # One fails
    data = {"symbol": "TSLA", "price": -5.0, "volume": 50000.0}
    report = validator.validate(data)
    assert report.overall_status == "FAIL"
    
    # One warning (outlier)
    validator.add_rule(ZScoreOutlierRule("price", threshold=2.0))
    context = {"mean": 1000.0, "std_dev": 50.0} # Normal range 900-1100
    data = {"symbol": "TSLA", "price": 700.0, "volume": 50000.0} # Outlier
    report = validator.validate(data, context=context)
    # Price is positive (RangeRule PASS), Schema is valid (SchemaRule PASS), but it is an outlier (WARNING)
    # Overall status should be WARNING
    assert report.overall_status == "WARNING"
