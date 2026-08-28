# 03 — Harden ChatGPT send confirmation and finalization

**What to build:** Make a ChatGPT delegation confirm a newly accepted user turn before trying fallback submission paths and finalize only the corresponding real assistant turn rather than transient or page-level text.

**Blocked by:** 02 — Re-establish the dependency and test baseline.

**Status:** ready-for-agent

- [ ] A newly created ChatGPT user turn prevents duplicate fallback sends.
- [ ] Transient ChatGPT states are not returned as final responses.
- [ ] ChatGPT completion uses explicit assistant-turn evidence and focused regression tests pass.
