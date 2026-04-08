from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RuleValidationResult(BaseModel):
    """Result of a single validation rule check."""

    rule_name: str
    status: str  # PASS, FAIL, WARNING
    message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class ValidationReport(BaseModel):
    """Consolidated report of all validation rules for a record."""

    table_name: str
    record_id: Optional[UUID] = None
    overall_status: str  # PASS, FAIL, WARNING
    results: List[RuleValidationResult] = Field(default_factory=list)
    raw_data: Optional[Dict[str, Any]] = None

    def add_result(self, result: RuleValidationResult):
        """Add a rule result and update the overall status."""
        self.results.append(result)

        # Precedence: FAIL > WARNING > PASS
        if result.status == "FAIL":
            self.overall_status = "FAIL"
        elif result.status == "WARNING" and self.overall_status != "FAIL":
            self.overall_status = "WARNING"
