# Web LLM Bridge Stage 1 Handoff

## Current state

This fork is established as the temporary Stage 1 source-donor workspace. Source behavior remains at Agentify v0.2.4 while the documentation is being aligned to the approved ChatGPT-first v1 plan in `web-llm-bridge-chatgpt-v1-plan.md`.

The v1 goal is a stable ChatGPT conversation that accepts delegated prompts, verifies a constrained ChatGPT mode selection, lets ChatGPT use the user's established Code MCP integration for approved local/project work, finalizes the exact assistant turn for each run, and returns raw response/completion metadata plus bounded ChatGPT-generated output files.

Claude and other existing provider implementations are not v1 targets. They may remain internally as stale last-known-working code unless shared infrastructure requires changes. Gemini may follow after the ChatGPT path is proven.

## Guardrails for the next changes

1. Preserve the local capability boundary: Code MCP owns project and system operations.
2. Distinguish stable conversation `key` from unique delegation `runId`; serialize active runs per key.
3. Keep Chrome CDP isolation, readiness states, conservative pacing, and run-scoped stop support.
4. Do not expose caller-local attachments, arbitrary paths, context packing, bundles, generic uploads, artifact ingestion, watch folders, arbitrary navigation, generic authenticated-page reading, or arbitrary JavaScript execution.
5. Permit only provider-originated output capture from the exact assistant turn correlated to a run, into a private bounded bridge-owned per-run cache.
6. Keep login, CAPTCHA, and consequential tool confirmations as manual handoffs.
7. Treat provider transport completion, completion-contract parsing, and caller acceptance as distinct.
8. Keep public-surface narrowing, reliability changes, output capture, and later internal deletion as separate reviewable changes.
9. Do not begin broad source deletion before the signed-in ChatGPT -> Code MCP -> caller proof succeeds.

## Immediate frontier

1. Complete and review the documentation correction.
2. Install dependencies from the existing lockfile and rerun the full baseline suite.
3. Make the first source-behavior slice the focused ChatGPT duplicate-send/finalization reliability work derived from upstream PR #57.
4. Re-evaluate upstream issue #60 separately before deciding whether a direct ChatGPT send-button path is still required.

The remaining work items and blocking edges are recorded in `web-llm-bridge-chatgpt-v1-plan.md` and mirrored under `.scratch/chatgpt-first-v1/issues/` because GitHub Issues are currently disabled on the fork.

## Caller integration

Codex or Visual Companion should use the run-level bridge interface:

```text
delegate({ provider: "chatgpt", key, prompt, mode, outputPolicy }) -> { runId, key, state }
status({ runId }) -> run state
result({ runId }) -> rawResponse, completion, selection, artifacts, warnings
stop({ runId })
```

The caller should not automate provider DOMs directly and does not need to understand Code MCP internals.
