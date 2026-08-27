# Web LLM Bridge Security Boundary

## Browser model

Use Chrome CDP with an Agentify-isolated Chrome profile. Do not default to the user's normal Chrome profile. The profile should contain only intentionally delegated provider logins, such as ChatGPT, Claude, Gemini, AI Studio, Perplexity, and Grok.

## Retained safeguards

- loopback-only local service;
- bearer-token local authentication;
- conservative rate governor;
- query stop/cancel support;
- readiness states for login, CAPTCHA, and provider availability;
- manual login/CAPTCHA handoff.

No CAPTCHA bypass behavior is permitted.

## Capability boundary

Code MCP alone supplies approved local operations. The bridge must not be capable of local repo packing, arbitrary path reads, generic uploads, filesystem scanning, artifacts, bundles, watches, or local orchestration. Callers see task/session operations, never raw provider DOM or general browser primitives.

This is stronger than documentation asking callers not to use local capabilities: the final bridge API must make those capability classes unavailable.
