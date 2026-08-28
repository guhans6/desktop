# 06 — Add constrained ChatGPT mode selection

**What to build:** Let callers request a supported semantic ChatGPT reasoning mode and receive explicit verification or an unavailable/incompatible error instead of relying on provider selectors or silent substitution.

**Blocked by:** 05 — Add run lifecycle and exact turn correlation.

**Status:** completed

- [x] The public/internal mode vocabulary is constrained and ChatGPT-specific.
- [x] Explicit selections are verified from observable UI state.
- [x] Unavailable or unverifiable selections fail explicitly.
- [x] Result metadata distinguishes requested selection from observed effective information.

**Evidence (2026-08-28):** `current | instant | medium | high | extra_high | pro | pro_standard | pro_extended` is validated before queueing. Picker selection uses only fixed semantic labels, chooses an exact observed option field after semantic classification, and verifies the observable selected/picker state after the click. `Pro` plus a nested observable `Standard`/`Extended` selection is combined without claiming an internal model identity. Invalid modes return `invalid_chatgpt_mode`; unavailable and unverifiable selections fail explicitly. Final combined controller/run verification passed, followed by a standalone controller/mode pass after removing the temporary test aggregator. Signed-in live proof remains part of item 09.
