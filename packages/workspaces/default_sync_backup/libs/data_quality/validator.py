from __future__ import annotations

import abc
from typing import Any, Dict, List, Optional, Type

from pydantic import BaseModel, ValidationError

from libs.schemas.data_quality import RuleValidationResult, ValidationReport


class BaseRule(abc.ABC):
    """Abstract base class for a validation rule."""

    def __init__(self, name: str):
        self.name = name

    @abc.abstractmethod
    def validate(self, data: Any, context: Optional[Dict[str, Any]] = None) -> RuleValidationResult:
        """Execute the validation logic and return a result."""
        pass


class SchemaRule(BaseRule):
    """Validation rule that uses a Pydantic model for schema validation."""

    def __init__(self, model: Type[BaseModel], name: Optional[str] = None):
        super().__init__(name=name or f"SchemaValidation:{model.__name__}")
        self.model = model

    def validate(self, data: Any, context: Optional[Dict[str, Any]] = None) -> RuleValidationResult:
        try:
            self.model.model_validate(data)
            return RuleValidationResult(
                rule_name=self.name,
                status="PASS",
                message="Schema validation passed."
            )
        except ValidationError as e:
            return RuleValidationResult(
                rule_name=self.name,
                status="FAIL",
                message="Schema validation failed.",
                details={"errors": e.errors()}
            )


class DataValidator:
    """Main validation engine that runs a collection of rules against data."""

    def __init__(self, table_name: str, rules: Optional[List[BaseRule]] = None):
        self.table_name = table_name
        self.rules = rules or []

    def add_rule(self, rule: BaseRule):
        """Add a new validation rule to the validator."""
        self.rules.append(rule)

    def validate(self, data: Any, context: Optional[Dict[str, Any]] = None) -> ValidationReport:
        """Run all rules and consolidate the report."""
        report = ValidationReport(
            table_name=self.table_name,
            overall_status="PASS",
            raw_data=data if isinstance(data, dict) else None
        )

        for rule in self.rules:
            result = rule.validate(data, context=context)
            report.add_result(result)

        return report
