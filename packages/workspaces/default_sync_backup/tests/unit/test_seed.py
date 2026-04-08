"""Tests for the seed script data definitions."""

import pytest


@pytest.mark.unit
class TestSeedData:
    """Validate seed data completeness and structure."""

    def test_all_agent_types_seeded(self):
        from scripts.seed import AGENT_SEEDS

        from libs.db.models import AnalystType

        seeded_types = {a["analyst_type"] for a in AGENT_SEEDS}
        expected_types = {at.value for at in AnalystType}
        assert seeded_types == expected_types, (
            f"Missing agent seeds: {expected_types - seeded_types}"
        )

    def test_seed_data_has_required_fields(self):
        from scripts.seed import AGENT_SEEDS

        required_fields = {"analyst_type", "display_name", "description", "model_name", "config"}
        for agent in AGENT_SEEDS:
            missing = required_fields - set(agent.keys())
            assert not missing, f"Agent {agent['analyst_type']} missing fields: {missing}"

    def test_seed_data_display_names_non_empty(self):
        from scripts.seed import AGENT_SEEDS

        for agent in AGENT_SEEDS:
            assert len(agent["display_name"]) > 0
            assert len(agent["description"]) > 0

    def test_seed_data_configs_are_dicts(self):
        from scripts.seed import AGENT_SEEDS

        for agent in AGENT_SEEDS:
            assert isinstance(agent["config"], dict), (
                f"Agent {agent['analyst_type']} config should be a dict"
            )

    def test_no_duplicate_analyst_types(self):
        from scripts.seed import AGENT_SEEDS

        types = [a["analyst_type"] for a in AGENT_SEEDS]
        assert len(types) == len(set(types)), "Duplicate analyst types in seed data"
