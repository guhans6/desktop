# 09 — Live signed-in ChatGPT compatibility gate

**What to prove:** Before further UI-dependent bridge work, demonstrate against the current real ChatGPT UI that one harmless delegation can send exactly once, observe the correct assistant turn, verify or reject the requested ChatGPT mode, and return the run result. After that base smoke test passes, extend the same live run to Code MCP activity and one provider-generated temporary output.

**Blocked by:** No source ticket. Requires launching the bridge with its isolated Chrome profile and a one-time manual ChatGPT sign-in if that profile is not already authenticated.

**Status:** priority-live-gate

- [ ] The bridge launches with an isolated provider profile and current ChatGPT is reachable.
- [ ] Manual sign-in state is established or `needs_login` is surfaced truthfully.
- [ ] One harmless `/runs/delegate` prompt appears exactly once in the real ChatGPT conversation.
- [ ] The selected mode is confirmed from the real current picker or an explicit selection error is returned.
- [ ] The exact sent user turn and following assistant turn are correlated to the run on the live UI.
- [ ] The finalized raw response is returned through `/runs/result` with completion parsing semantics intact.
- [ ] Code MCP activity completes through the existing integration topology.
- [ ] At least one real provider-generated temporary output is returned with metadata and a private bridge-cache path.
- [ ] Transport completion remains distinct from caller acceptance.

**Priority rule:** Items 03, 04, 05, and 06 are implementation-complete only at the automated-regression level until this live gate proves their UI-dependent behavior. Item 07 is paused at its browser-capture boundary, and item 08 must not be finalized, until the base live smoke test passes.
