# 03 — Harden ChatGPT send confirmation and finalization

**What to build:** Make a ChatGPT delegation confirm a newly accepted user turn before trying fallback submission paths and finalize only the corresponding real assistant turn rather than transient or page-level text.

**Blocked by:** 02 — Re-establish the dependency and test baseline.

**Status:** implemented-pending-live-proof

- [x] A newly created ChatGPT user turn prevents duplicate fallback sends; more than one new user turn fails closed.
- [x] Transient ChatGPT states and stable-looking partial text are not returned as final responses.
- [x] ChatGPT completion uses the exact post-send assistant-role turn plus finished-turn action evidence.
- [x] Focused controller verification passed: 6/6 before the direct-send follow-up, then 7/7 with the compatibility test included.

**Commit:** `330f51e069b43ab6f373a499b51e3512b7aa0330` (`fix: correlate ChatGPT send and completion turns`)
