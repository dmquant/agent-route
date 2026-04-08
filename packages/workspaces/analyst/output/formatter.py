"""Structured report assembly from raw model output.

Identifies headers, tables, and bullet points to build a
StructuredReport suitable for export renderers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ReportSection:
    """A single section of a structured report."""

    heading: str
    content: str
    section_type: str = "text"  # text | table | list | chart


@dataclass
class StructuredReport:
    """A fully structured analysis report."""

    title: str = ""
    sections: list[ReportSection] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


def format_report(raw_output: str, template: dict[str, Any] | None = None) -> StructuredReport:
    """Parse raw model output into a StructuredReport."""
    raise NotImplementedError
