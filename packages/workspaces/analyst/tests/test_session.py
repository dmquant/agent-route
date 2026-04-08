"""Tests for core.session module."""

from __future__ import annotations

from packages.workspaces.analyst.core.session import AnalysisSession, SessionManager


def test_analysis_session_defaults():
    session = AnalysisSession()
    assert session.id
    assert session.turns == []
    assert session.metadata == {}


def test_session_manager_instantiates():
    manager = SessionManager()
    assert manager is not None
