# 08 — Expose the ChatGPT-only v1 public surface

**What to build:** Give callers the narrow `delegate`, `status`, `result`, and `stop` interface for ChatGPT while removing generic local-capability and provider controls from the advertised v1 bridge API.

**Blocked by:** 06 — Add constrained ChatGPT mode selection; 07 — Parse completion and capture provider outputs per run.

**Status:** ready-for-agent

- [ ] The advertised provider is ChatGPT only.
- [ ] The public interface uses run IDs and stable conversation keys as documented.
- [ ] Local-input attachments, context paths, bundles, watch folders, arbitrary navigation/read, and generic artifact ingestion are unavailable from the new public surface.
- [ ] Stale internal provider code is not broadly deleted in this ticket.
