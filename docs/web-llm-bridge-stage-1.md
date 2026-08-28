# Stage 1 Plan: ChatGPT-First Web LLM Bridge

## Goal

Prove a narrow, authenticated ChatGPT transport and delegation loop without turning the bridge into another filesystem/context MCP:

```text
Caller -> Web LLM Bridge -> ChatGPT -> established Code MCP -> project/local work
       <- exact-turn result + bounded ChatGPT-generated outputs <-
```

ChatGPT is the v1 provider. Gemini may follow. Existing Claude/other-provider code may remain as stale last-known-working internal implementation unless shared infrastructure requires it; the new v1 public bridge surface does not advertise those providers.

The detailed contract, run lifecycle, mode contract, provider-output cache requirements, and blocking edges are defined in `web-llm-bridge-chatgpt-v1-plan.md`.

## Stage 1 sequence

1. Correct the documentation boundary: allow only bounded provider-originated output capture while continuing to prohibit caller-local attachments, arbitrary paths, context packing, bundles, generic uploads, artifact ingestion, watch folders, filesystem scanning, arbitrary navigation, and generic page reads.
2. Install dependencies from the existing lockfile and establish a fresh full-test baseline.
3. Harden ChatGPT send confirmation and assistant-turn finalization using the narrowly relevant reliability behavior from upstream PR #57.
4. Re-evaluate the ChatGPT send-button stall from upstream issue #60 and add a ChatGPT-specific direct send path only if it remains applicable.
5. Add unique `runId`, per-key serialization, a long-lived run registry, exact user/assistant turn correlation, run-scoped status, and run-scoped stop.
6. Add constrained ChatGPT mode selection and observable verification.
7. Add versioned completion parsing and browser-session-aware per-run provider-output capture with limits, hashes, private permissions, and TTL cleanup.
8. Expose the ChatGPT-only `delegate`, `status`, `result`, and `stop` public v1 surface; keep public-surface narrowing separate from broad internal deletion.
9. Prove one harmless signed-in ChatGPT -> Code MCP -> caller run, including a generated temporary output artifact.
10. Only after that proof, incrementally delete now-unreachable generic context, upload, watch, navigation/read, artifact-ingestion, and orchestration paths.

## Non-goals in the current phase

- Broad source deletion or a new independent implementation before the ChatGPT loop is proven.
- Reworking Claude or other providers for v1.
- Caller-local attachments, arbitrary caller paths, caller-chosen output directories, or generic artifact reuse/ingestion.
- A final product name, distribution strategy, or trademark decision.
- CAPTCHA bypass, browser-profile sharing, automatic approval of consequential tool confirmations, or general browser automation.
- Treating provider transport completion as independent proof that delegated project work is correct.

## Immediate implementation frontier

The first two executable items are documentation correction and fresh baseline verification. The first source-behavior change after that baseline is the focused ChatGPT duplicate-send/finalization reliability slice. Do not begin broad public-surface or module deletion before these prerequisites are verified.
