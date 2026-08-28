# 09 — Prove ChatGPT to Code MCP to caller end to end

**What to build:** Demonstrate one harmless signed-in delegation that selects a ChatGPT mode, uses the established Code MCP integration for local work, finalizes the correct assistant turn, captures a generated temporary artifact, and returns the result to the caller.

**Blocked by:** 08 — Expose the ChatGPT-only v1 public surface.

**Status:** ready-for-agent

- [ ] The selected mode is confirmed or an explicit selection error is returned.
- [ ] The exact sent user turn and following assistant turn are correlated to the run.
- [ ] Code MCP activity completes through the existing integration topology.
- [ ] At least one provider-generated temporary output is returned with metadata and a bridge-cache path.
- [ ] Transport completion remains distinct from caller acceptance.
