"""Plain-text and paste input handling."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ExtractedContent:
    """Content extracted from any input source."""

    text: str
    source_type: str
    char_count: int = 0
    metadata: dict | None = None

    def __post_init__(self) -> None:
        if not self.char_count:
            self.char_count = len(self.text)


def parse_text(raw: str) -> ExtractedContent:
    """Normalise raw pasted text into ExtractedContent."""
    cleaned = raw.strip()
    return ExtractedContent(text=cleaned, source_type="text")
