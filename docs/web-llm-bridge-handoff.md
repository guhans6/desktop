# Web LLM Bridge Stage 1 Handoff

## Current state

This fork is established as the temporary Stage 1 source-donor workspace. The Stage 1 branch contains architecture and reduction documentation only; source behavior remains at Agentify v0.2.4.

## Guardrails for the next change

1. Preserve the local capability boundary: Code MCP owns project and system operations.
2. Make the public bridge query input text-only before deleting internal context/attachment code.
3. Keep stable keyed sessions, Chrome CDP isolation, readiness states, rate pacing, and stop support.
4. Do not expose raw browser navigation, authenticated-page reading, JavaScript execution, or generic uploads.
5. Keep changes small: public schema, tool removal, implementation-path deletion, and tests should be separate commits.

## Future Visual Companion integration

Visual Companion should call a task/session-level bridge interface:

```text
delegate(task, provider, stableKey) -> task/session ID
status(task/session ID) -> running | needs-attention | completed | failed
result(task/session ID) -> summary, verification, remaining work
```

It should not automate provider DOMs directly and does not need to understand Code MCP internals.
