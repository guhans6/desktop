# 05 — Add run lifecycle and exact turn correlation

**What to build:** Let callers create an independent run inside a reusable ChatGPT conversation and reliably observe or stop that run without confusing it with other turns or sessions.

**Blocked by:** 03 — Harden ChatGPT send confirmation and finalization.

**Status:** ready-for-agent

- [ ] Every delegation receives a unique run ID separate from the stable conversation key.
- [ ] Runs sharing a conversation key cannot race active sends.
- [ ] Each run binds to its accepted user turn and following assistant turn.
- [ ] Status and stop operate on the run rather than whichever tab happens to be current.
