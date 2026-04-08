from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from libs.db.data_quality_models import DataQualityLog, QuarantineData, ValidationStatus
from libs.schemas.data_quality import ValidationReport


class DataQualityService:
    """Service for persisting data quality logs and quarantining invalid data."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def log_results(self, report: ValidationReport):
        """Log each rule result to the database."""
        for res in report.results:
            log_entry = DataQualityLog(
                table_name=report.table_name,
                record_id=report.record_id,
                rule_name=res.rule_name,
                status=ValidationStatus(res.status),
                message=res.message,
                details=res.details,
            )
            self.session.add(log_entry)

    async def quarantine_if_needed(self, report: ValidationReport, source: str):
        """Quarantine the record if its overall status is FAIL."""
        if report.overall_status == "FAIL":
            quarantine_entry = QuarantineData(
                source=source,
                raw_data=report.raw_data or {},
                reason=f"Validation failed with status {report.overall_status}",
                validation_details={
                    "results": [
                        {
                            "rule_name": r.rule_name,
                            "status": r.status,
                            "message": r.message,
                            "details": r.details,
                        }
                        for r in report.results
                    ]
                },
            )
            self.session.add(quarantine_entry)
            return True
        return False

    async def run_and_log(self, validator: Any, data: Any, source: str, context: Optional[Dict[str, Any]] = None) -> ValidationReport:
        """Convenience method to run validation, log it, and quarantine if failed."""
        report = validator.validate(data, context=context)
        await self.log_results(report)
        await self.quarantine_if_needed(report, source)
        return report
