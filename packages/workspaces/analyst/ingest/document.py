"""Document parsing — PDF, DOCX, CSV, JSON, TXT.

Uses pdfplumber for PDF, python-docx for DOCX, and stdlib for
CSV / JSON / TXT.
"""

from __future__ import annotations

from typing import Any

from .text import ExtractedContent


async def parse_document(file: Any) -> ExtractedContent:
    """Parse an uploaded file into plain-text content.

    Parameters
    ----------
    file:
        An ``UploadFile``-like object with ``.filename``, ``.read()``,
        and ``.content_type`` attributes.

    Returns
    -------
    ExtractedContent
        Extracted text with source metadata.
    """
    raise NotImplementedError
