from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from libs.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ValidationStatus(str, enum.Enum):
    """Status of a data quality validation rule."""
    PASS = "PASS"
    FAIL = "FAIL"
    WARNING = "WARNING"


class DataQualityLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Audit log for data quality validation results."""
    __tablename__ = "data_quality_log"
    __table_args__ = (
        Index("ix_dq_log_table_record", "table_name", "record_id"),
        Index("ix_dq_log_status", "status"),
        {"schema": "data_quality"},
    )

    table_name: Mapped[str] = mapped_column(String(255), nullable=False)
    record_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[ValidationStatus] = mapped_column(SAEnum(ValidationStatus), nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)


class QuarantineData(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Storage for data that failed validation and is quarantined."""
    __tablename__ = "quarantine_data"
    __table_args__ = (
        Index("ix_quarantine_source", "source"),
        Index("ix_quarantine_processed_status", "processed_status"),
        {"schema": "data_quality"},
    )

    source: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    validation_details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    processed_status: Mapped[str] = mapped_column(
        String(50), default="PENDING", nullable=False
    )  # PENDING, APPROVED, DROPPED
