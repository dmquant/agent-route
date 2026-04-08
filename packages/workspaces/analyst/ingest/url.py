"""URL content fetching and extraction.

Uses httpx for fetching and trafilatura for readable-text extraction.
"""

from __future__ import annotations

from .text import ExtractedContent


async def fetch_url(url: str) -> ExtractedContent:
    """Fetch a URL and extract readable text content.

    Parameters
    ----------
    url:
        The target URL to fetch.

    Returns
    -------
    ExtractedContent
        Extracted text with URL metadata.
    """
    raise NotImplementedError
