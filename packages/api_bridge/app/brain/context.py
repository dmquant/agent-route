"""Context Engine — manages context windows for brain invocations.

Key Anthropic insight: "irreversible decisions to selectively retain
or discard context can lead to failures." The session event log stores
ALL context durably. The ContextEngine decides what to pass to the
brain's context window for each turn — full replay, sliding window,
or compaction.
"""

from typing import List, Optional
from app.session.events import EventType, SessionEvent
from app.session.manager import SessionEventManager
from app.brain.harness import HarnessConfig

# Rough token estimate: 1 token ≈ 4 chars
_CHARS_PER_TOKEN = 4


class ContextEngine:
    """Builds optimal context windows from durable event logs.

    Context strategies:
    1. Full replay  — All events (small sessions)
    2. Sliding window — Last N events by token budget
    3. Compaction    — Summary of old + verbatim recent
    """

    def __init__(self, session_mgr: SessionEventManager):
        self.sessions = session_mgr

    def estimate_tokens(self, event: SessionEvent) -> int:
        """Rough token estimate for a single event."""
        text_len = len(event.content or "")
        meta_len = sum(len(str(v)) for v in (event.metadata or {}).values())
        overhead = 20  # event type, agent, timestamp
        return (text_len + meta_len + overhead) // _CHARS_PER_TOKEN

    def build_context(
        self,
        session_id: str,
        harness: HarnessConfig,
        event_types: Optional[List[EventType]] = None,
    ) -> dict:
        """Build a context window from the session event log.

        Returns:
            {
                "events": [...],        # Events to include in context
                "strategy": "...",      # Which strategy was used
                "total_events": N,      # Total events in session
                "included_events": N,   # Events in context window
                "estimated_tokens": N,  # Token count estimate
                "compacted": bool,      # Whether compaction was applied
            }
        """
        all_events = self.sessions.get_events(
            session_id, event_types=event_types, limit=10000
        )

        if not all_events:
            return {
                "events": [],
                "strategy": "empty",
                "total_events": 0,
                "included_events": 0,
                "estimated_tokens": 0,
                "compacted": False,
            }

        total_tokens = sum(self.estimate_tokens(e) for e in all_events)
        budget = harness.max_context_tokens

        # Strategy 1: Full replay (fits in context)
        if total_tokens < budget * 0.5:
            return {
                "events": [e.to_dict() for e in all_events],
                "strategy": "full_replay",
                "total_events": len(all_events),
                "included_events": len(all_events),
                "estimated_tokens": total_tokens,
                "compacted": False,
            }

        # Check if compaction should trigger
        if harness.auto_compact and total_tokens > budget * harness.compact_threshold:
            if harness.compact_strategy == "summary":
                return self._compact_summary(all_events, budget, harness)
            else:
                return self._compact_tail(all_events, budget)

        # Strategy 2: Sliding window (keep recent events within budget)
        return self._sliding_window(all_events, budget)

    def _sliding_window(self, events: List[SessionEvent], budget: int) -> dict:
        """Keep the most recent events that fit within the token budget."""
        included = []
        used_tokens = 0

        for event in reversed(events):
            tokens = self.estimate_tokens(event)
            if used_tokens + tokens > budget:
                break
            included.insert(0, event)
            used_tokens += tokens

        return {
            "events": [e.to_dict() for e in included],
            "strategy": "sliding_window",
            "total_events": len(events),
            "included_events": len(included),
            "estimated_tokens": used_tokens,
            "compacted": False,
        }

    def _compact_tail(self, events: List[SessionEvent], budget: int) -> dict:
        """Keep only the last 30% of events verbatim, drop the rest."""
        split = int(len(events) * 0.7)
        recent = events[split:]
        used_tokens = sum(self.estimate_tokens(e) for e in recent)

        # If recent still exceeds budget, apply sliding window to recent
        if used_tokens > budget:
            return self._sliding_window(recent, budget)

        return {
            "events": [e.to_dict() for e in recent],
            "strategy": "compact_tail",
            "total_events": len(events),
            "included_events": len(recent),
            "estimated_tokens": used_tokens,
            "compacted": True,
            "dropped_events": split,
        }

    def _compact_summary(
        self, events: List[SessionEvent], budget: int, harness: HarnessConfig
    ) -> dict:
        """Summarize old events, keep recent events verbatim.

        The summary is a synthetic event that captures the key information
        from the dropped events without using their full token budget.
        """
        split = int(len(events) * 0.7)
        old_events = events[:split]
        recent_events = events[split:]

        # Build a compact summary of old events
        summary_lines = []
        tool_calls = [e for e in old_events if e.event_type in (
            EventType.TOOL_CALL.value, EventType.TOOL_CALL
        )]
        errors = [e for e in old_events if e.event_type in (
            EventType.TOOL_ERROR.value, EventType.TOOL_ERROR, EventType.ERROR.value, EventType.ERROR
        )]
        messages = [e for e in old_events if e.event_type in (
            EventType.USER_MESSAGE.value, EventType.USER_MESSAGE
        )]

        if messages:
            summary_lines.append(f"[Context] {len(messages)} user messages processed")
        if tool_calls:
            agents_used = set(e.agent for e in tool_calls if e.agent)
            summary_lines.append(
                f"[Context] {len(tool_calls)} tool calls via: {', '.join(agents_used)}"
            )
        if errors:
            summary_lines.append(f"[Context] {len(errors)} errors encountered")

        summary_text = "\n".join(summary_lines) if summary_lines else "[Context] Session history compacted"

        # Create synthetic summary event
        summary_event = {
            "id": 0,
            "session_id": events[0].session_id if events else "",
            "event_type": "context.compact",
            "agent": None,
            "content": summary_text,
            "metadata": {
                "compacted_events": len(old_events),
                "strategy": "summary",
            },
            "timestamp": old_events[-1].timestamp if old_events else 0,
        }

        recent_dicts = [e.to_dict() for e in recent_events]
        used_tokens = (
            len(summary_text) // _CHARS_PER_TOKEN
            + sum(self.estimate_tokens(e) for e in recent_events)
        )

        return {
            "events": [summary_event] + recent_dicts,
            "strategy": "compact_summary",
            "total_events": len(events),
            "included_events": len(recent_events) + 1,
            "estimated_tokens": used_tokens,
            "compacted": True,
            "dropped_events": len(old_events),
            "summary": summary_text,
        }

    def rewind(
        self, session_id: str, before_event_id: int, count: int = 10
    ) -> List[dict]:
        """Rewind: get N events before a specific event.

        Useful for debugging: "what happened right before this error?"
        """
        events = self.sessions.get_events(
            session_id,
            start=max(1, before_event_id - count),
            end=before_event_id,
        )
        return [e.to_dict() for e in events]

    def get_context_stats(self, session_id: str, harness: HarnessConfig) -> dict:
        """Get context utilization stats without building the full window."""
        all_events = self.sessions.get_events(session_id, limit=10000)
        total_tokens = sum(self.estimate_tokens(e) for e in all_events)
        budget = harness.max_context_tokens

        return {
            "session_id": session_id,
            "total_events": len(all_events),
            "estimated_tokens": total_tokens,
            "context_budget": budget,
            "utilization": round(total_tokens / budget, 3) if budget > 0 else 0,
            "needs_compaction": (
                harness.auto_compact
                and budget > 0
                and total_tokens > budget * harness.compact_threshold
            ),
            "strategy_if_built": (
                "full_replay" if total_tokens < budget * 0.5
                else "compact_" + harness.compact_strategy if harness.auto_compact
                else "sliding_window"
            ),
        }
