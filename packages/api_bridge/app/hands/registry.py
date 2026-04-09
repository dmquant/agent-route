"""Hand Registry — manages all available hands.

Cattle, not pets: every hand is interchangeable and replaceable.
"""

import asyncio
from typing import Optional, Dict, List
from app.hands.base import Hand


class HandRegistry:
    """Central registry of all available execution hands."""

    def __init__(self):
        self._hands: Dict[str, Hand] = {}

    def register(self, hand: Hand) -> None:
        """Register a hand by its name."""
        self._hands[hand.name] = hand
        print(f"[HandRegistry] Registered: {hand}")

    def get(self, name: str) -> Optional[Hand]:
        """Get a hand by name. Returns None if not found."""
        return self._hands.get(name)

    def list_all(self) -> List[Hand]:
        """List all registered hands."""
        return list(self._hands.values())

    def list_names(self) -> List[str]:
        """List all registered hand names."""
        return list(self._hands.keys())

    def list_info(self) -> List[dict]:
        """Serializable list of hand metadata."""
        return [h.info() for h in self._hands.values()]

    async def health_check_all(self) -> Dict[str, bool]:
        """Check health of all registered hands concurrently."""
        results = {}

        async def check_one(name: str, hand: Hand):
            try:
                results[name] = await asyncio.wait_for(hand.health_check(), timeout=10)
            except Exception:
                results[name] = False

        await asyncio.gather(
            *[check_one(n, h) for n, h in self._hands.items()]
        )
        return results

    def __len__(self):
        return len(self._hands)


# ─── Global Singleton ──────────────────────
hand_registry = HandRegistry()


def auto_register_all():
    """Auto-discover and register all built-in hands."""
    from app.hands.gemini_hand import GeminiHand
    from app.hands.claude_hand import ClaudeHand
    from app.hands.codex_hand import CodexHand
    from app.hands.ollama_hand import OllamaHand
    from app.hands.mflux_hand import MfluxHand

    for HandClass in [GeminiHand, ClaudeHand, CodexHand, OllamaHand, MfluxHand]:
        hand_registry.register(HandClass())

    print(f"[HandRegistry] {len(hand_registry)} hands registered: {hand_registry.list_names()}")
