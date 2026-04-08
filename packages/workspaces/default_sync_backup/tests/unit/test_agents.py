"""Tests for the agent registry."""

import pytest

from libs.db.models import AnalystType
from services.agents.registry import AGENT_REGISTRY, get_agent


@pytest.mark.unit
class TestAgentRegistry:
    """Agent registry unit tests."""

    def test_registry_has_all_agents(self):
        """All six analyst types should be registered."""
        assert len(AGENT_REGISTRY) == 6
        for t in AnalystType:
            assert t in AGENT_REGISTRY

    def test_get_agent_unknown_type(self):
        """get_agent should raise ValueError for unknown types."""
        with pytest.raises(ValueError, match="Unknown analyst type"):
            get_agent("nonexistent", db=None, redis=None, kafka=None)

    def test_each_agent_has_correct_type(self):
        """Each registered agent should report the correct analyst_type."""
        for analyst_type, agent_cls in AGENT_REGISTRY.items():
            agent = agent_cls(db=None, redis=None, kafka=None)
            assert agent.agent_type == analyst_type
