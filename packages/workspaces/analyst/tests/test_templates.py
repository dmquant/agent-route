"""Tests for templates module."""

from __future__ import annotations

from packages.workspaces.analyst.templates.engine import TemplateEngine
from packages.workspaces.analyst.templates.registry import TemplateRegistry


def test_template_engine_instantiates():
    engine = TemplateEngine()
    assert engine is not None


def test_template_registry_instantiates():
    registry = TemplateRegistry()
    assert registry is not None
