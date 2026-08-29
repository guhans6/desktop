# Web LLM Bridge Security Boundary

## Browser model

Use Chrome CDP with an Agentify-isolated Chrome profile. Do not default to the user's normal Chrome profile. For v1, the intentionally delegated login is ChatGPT. Other existing provider profiles may remain internally as stale last-known-working implementation, but they are not advertised by the ChatGPT-first public bridge surface.

## Retained safeguards

- loopback-only local service;
- bearer-token local authentication;
- conservative rate governor;
- run-scoped stop/cancel support;
- readiness states for login, CAPTCHA, tool confirmation, and provider availability;
- manual login/CAPTCHA/tool-confirmation handoff.

No CAPTCHA bypass behavior is permitted. The bridge must not automatically approve consequential Code MCP or provider tool confirmations.

## Capability boundary

Code MCP alone supplies approved local operations. The bridge must not be capable of local repo packing, arbitrary caller path reads, caller-local attachments, generic uploads, filesystem scanning, artifact ingestion, context bundles, watches, or local orchestration. Callers see run/session operations, never raw provider DOM or general browser primitives.

This is stronger than documentation asking callers not to use local capabilities: the final bridge API must make those capability classes unavailable.

## Provider-originated output exception

Provider-originated output capture is allowed and is not artifact ingestion. A file or image may enter the bridge cache only when it originates from the ChatGPT assistant turn correlated to the specific `runId` being finalized.

The output cache must:

- be bridge-owned and private, with no caller-specified output directory;
- correlate every retained artifact to the exact assistant turn and `runId`;
- use browser-session-aware download/capture rather than arbitrary Node fetching of provider URLs;
- accept no caller-supplied source URLs;
- enforce server-owned limits for artifact count, per-file size, and aggregate run size;
- sanitize names, prevent traversal/collisions, and validate MIME/content as practical;
- compute SHA-256 for retained artifacts;
- use private filesystem permissions where supported;
- apply TTL cleanup;
- return cache paths and safe metadata only, never credentials, cookies, or persisted signed source URLs.

The caller may subsequently use Code MCP for any approved local handling of a returned cache artifact. The bridge itself does not gain general filesystem capability from this exception.
