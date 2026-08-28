# 06 — Add constrained ChatGPT mode selection

**What to build:** Let callers request a supported semantic ChatGPT reasoning mode and receive explicit verification or an unavailable/incompatible error instead of relying on provider selectors or silent substitution.

**Blocked by:** 05 — Add run lifecycle and exact turn correlation.

**Status:** ready-for-agent

- [ ] The public/internal mode vocabulary is constrained and ChatGPT-specific.
- [ ] Explicit selections are verified from observable UI state.
- [ ] Unavailable or unverifiable selections fail explicitly.
- [ ] Result metadata distinguishes requested selection from observed effective information.
