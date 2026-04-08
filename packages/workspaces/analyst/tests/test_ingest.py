"""Tests for ingest module."""

from __future__ import annotations

from packages.workspaces.analyst.ingest.text import ExtractedContent, parse_text


def test_parse_text_basic():
    result = parse_text("  Hello world  ")
    assert isinstance(result, ExtractedContent)
    assert result.text == "Hello world"
    assert result.source_type == "text"
    assert result.char_count == 11


def test_parse_text_empty():
    result = parse_text("")
    assert result.text == ""
    assert result.char_count == 0
