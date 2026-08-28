# 04 — Resolve ChatGPT direct send-button compatibility

**What to build:** Re-check the visible-send-button stall documented upstream and, when still applicable, use a ChatGPT-specific explicit send-button path before slower fallbacks without weakening send confirmation.

**Blocked by:** 03 — Harden ChatGPT send confirmation and finalization.

**Status:** implemented-pending-live-proof

- [ ] Re-evaluate the upstream issue #60 behavior against the signed-in ChatGPT UI during the live proof.
- [x] The current controller had the same risky ordering described upstream: humanized mouse send before an exact ChatGPT DOM click.
- [x] ChatGPT now tries the exact `button[data-testid="send-button"]` DOM click first, verifies acceptance through the new-user-turn invariant, and retains mouse/form/keyboard fallbacks.
- [x] Focused controller verification passed 7/7 after the compatibility change.

**Commit:** `563c0ab2cf6dc46572dea25a68f7f7a2d357abd1` (`fix: prefer direct ChatGPT send click`)
