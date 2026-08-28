# 04 — Resolve ChatGPT direct send-button compatibility

**What to build:** Re-check the visible-send-button stall documented upstream and, when still applicable, use a ChatGPT-specific explicit send-button path before slower fallbacks without weakening send confirmation.

**Blocked by:** 03 — Harden ChatGPT send confirmation and finalization.

**Status:** ready-for-agent

- [ ] The upstream issue #60 behavior is re-evaluated against the signed-in ChatGPT UI.
- [ ] If reproduced, the explicit ChatGPT send path is covered by a regression test and retains existing fallback behavior.
- [ ] If not reproduced, the ticket records why no source change is required.
