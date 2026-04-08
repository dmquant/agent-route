"""Tests for output module."""

from __future__ import annotations

from packages.workspaces.analyst.output.formatter import ReportSection, StructuredReport


def test_structured_report_defaults():
    report = StructuredReport()
    assert report.title == ""
    assert report.sections == []
    assert report.metadata == {}


def test_report_section_creation():
    section = ReportSection(heading="Summary", content="Test content")
    assert section.heading == "Summary"
    assert section.section_type == "text"
