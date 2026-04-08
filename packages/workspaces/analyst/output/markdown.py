"""Markdown export renderer."""

from __future__ import annotations

from .formatter import StructuredReport


def render_markdown(report: StructuredReport) -> str:
    """Render a StructuredReport as a Markdown string."""
    raise NotImplementedError
