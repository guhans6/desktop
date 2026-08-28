# 08 — Expose the ChatGPT-only v1 public surface

**What to build:** Give callers the narrow `delegate`, `status`, `result`, and `stop` interface for ChatGPT while removing generic local-capability and provider controls from the advertised v1 bridge API.

**Blocked by:** 09 — Live signed-in ChatGPT compatibility gate; 07 — completion/output capture must be live-proven afterward.

**Status:** blocked-on-live-proof

- [ ] The advertised provider is ChatGPT only.
- [ ] The public interface uses run IDs and stable conversation keys as documented.
- [ ] Local-input attachments, context paths, bundles, watch folders, arbitrary navigation/read, and generic artifact ingestion are unavailable from the new public surface.
- [ ] Stale internal provider code is not broadly deleted in this ticket.

Do not finalize or advertise the v1 public surface until the current ChatGPT UI passes the live smoke test. Public API shape should follow proven provider behavior rather than force the live integration to fit stale assumptions.
