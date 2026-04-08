"""PDF export renderer.

Uses WeasyPrint to convert structured reports to PDF.
"""

from __future__ import annotations

from .formatter import StructuredReport


def render_pdf(report: StructuredReport) -> bytes:
    """Render a StructuredReport to PDF bytes."""
    raise NotImplementedError
