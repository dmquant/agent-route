from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Union

from libs.data_quality.validator import BaseRule, RuleValidationResult


class RangeRule(BaseRule):
    """Rule that checks if a numeric field is within a specified range."""

    def __init__(
        self,
        field: str,
        min_val: Optional[Union[int, float]] = None,
        max_val: Optional[Union[int, float]] = None,
        name: Optional[str] = None
    ):
        super().__init__(name=name or f"RangeRule:{field}")
        self.field = field
        self.min_val = min_val
        self.max_val = max_val

    def validate(self, data: Any, context: Optional[Dict[str, Any]] = None) -> RuleValidationResult:
        value = data.get(self.field) if isinstance(data, dict) else getattr(data, self.field, None)

        if value is None:
            return RuleValidationResult(
                rule_name=self.name, status="PASS", message=f"Field {self.field} is missing; skipping range check."
            )

        try:
            val = float(value)
            if self.min_val is not None and val < self.min_val:
                return RuleValidationResult(
                    rule_name=self.name, status="FAIL", message=f"{self.field} ({val}) is below minimum {self.min_val}."
                )
            if self.max_val is not None and val > self.max_val:
                return RuleValidationResult(
                    rule_name=self.name, status="FAIL", message=f"{self.field} ({val}) is above maximum {self.max_val}."
                )
            return RuleValidationResult(rule_name=self.name, status="PASS")
        except (ValueError, TypeError):
            return RuleValidationResult(
                rule_name=self.name, status="FAIL", message=f"{self.field} is not a numeric value."
            )


class ZScoreOutlierRule(BaseRule):
    """Rule that flags records that are outliers based on historical statistics (Z-score)."""

    def __init__(self, field: str, threshold: float = 3.0, name: Optional[str] = None):
        super().__init__(name=name or f"ZScoreRule:{field}")
        self.field = field
        self.threshold = threshold

    def validate(self, data: Any, context: Optional[Dict[str, Any]] = None) -> RuleValidationResult:
        """Expects mean and std_dev to be passed in context."""
        if not context or "mean" not in context or "std_dev" not in context:
            return RuleValidationResult(
                rule_name=self.name, status="WARNING", message="Missing historical context (mean/std_dev). Skipping outlier check."
            )

        value = data.get(self.field) if isinstance(data, dict) else getattr(data, self.field, None)
        if value is None:
            return RuleValidationResult(rule_name=self.name, status="PASS")

        try:
            val = float(value)
            mean = context["mean"]
            std_dev = context["std_dev"]

            if std_dev == 0:
                return RuleValidationResult(rule_name=self.name, status="PASS")

            z_score = abs(val - mean) / std_dev
            if z_score > self.threshold:
                return RuleValidationResult(
                    rule_name=self.name,
                    status="WARNING",
                    message=f"{self.field} ({val}) is an outlier (Z-score={z_score:.2f} > {self.threshold}).",
                    details={"z_score": z_score, "mean": mean, "std_dev": std_dev}
                )

            return RuleValidationResult(rule_name=self.name, status="PASS")
        except (ValueError, TypeError):
             return RuleValidationResult(
                rule_name=self.name, status="FAIL", message=f"{self.field} is not a numeric value for outlier detection."
            )
