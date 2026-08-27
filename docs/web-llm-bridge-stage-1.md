# Stage 1 Plan: Minimal Web LLM Bridge

## Goal

Prove a narrow, authenticated-browser transport loop without turning the bridge into another filesystem/context MCP:

```text
Caller -> Web LLM Bridge -> web provider -> Code MCP -> project
       <- structured provider result <-
```

## Stage 1 sequence

1. Establish this fork and document the boundary, source baseline, security constraints, and reduction map.
2. Narrow query inputs to text-only provider transport.
3. Remove public bundle, watch-folder, artifact, attachment, and context-path tools.
4. Remove their implementation paths incrementally rather than with a single destructive rewrite.
5. Restrict browser-facing APIs to provider sessions.
6. Test text query, keyed-session reuse, status, stop/cancel, readiness, and completion metadata.
7. Port provider compatibility fixes only after verifying the current upstream behavior.
8. Validate an end-to-end delegated Code MCP loop.

## Non-goals in this initial documentation baseline

- Broad source deletion or a new independent implementation.
- A final product name, distribution strategy, or trademark decision.
- CAPTCHA bypass, browser-profile sharing, or general browser automation.
- Treating a provider's `completed` result as independent proof that project work is correct.

## First implementation change

The smallest, highest-leverage source change is to rewrite the public MCP `query` schema in `mcp-server.mjs` to accept only `provider`, `key`, and text `prompt`, while returning a clear validation error for attachment/context inputs. Keep internal code untouched in that commit; follow-up commits remove unreachable routes and modules.
