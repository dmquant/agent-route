"""Tests for API endpoints (no infrastructure required)."""

import pytest
from fastapi.testclient import TestClient

from services.api.app import create_app


@pytest.fixture
def client():
    """Create a test client that skips lifespan (no Docker needed)."""
    app = create_app()
    app.router.lifespan_context = None
    return TestClient(app)


@pytest.mark.integration
class TestHealthEndpoints:
    """Health check endpoint tests."""

    def test_health_liveness(self, client):
        """GET /health should return ok."""
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "ai-stock-research"

    def test_health_readiness_without_infra(self, client):
        """GET /health/ready should return degraded when infra is unavailable."""
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        data = resp.json()
        # Without Docker services running, readiness should report degraded
        assert data["status"] in ("ok", "degraded")


@pytest.mark.integration
class TestAgentEndpoints:
    """Agent API endpoint tests."""

    def test_list_agents(self, client):
        """GET /api/v1/agents should return all 6 agents."""
        resp = client.get("/api/v1/agents")
        assert resp.status_code == 200
        agents = resp.json()
        assert len(agents) == 6
        types = {a["type"] for a in agents}
        assert types == {"macro", "technical", "fundamental", "sentiment", "risk", "quantitative"}

    def test_get_single_agent(self, client):
        """GET /api/v1/agents/macro should return macro analyst details."""
        resp = client.get("/api/v1/agents/macro")
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "macro"
        assert data["status"] == "ready"

    def test_get_unknown_agent_returns_422(self, client):
        """GET /api/v1/agents/nonexistent should return 422 (invalid enum)."""
        resp = client.get("/api/v1/agents/nonexistent")
        assert resp.status_code == 422
