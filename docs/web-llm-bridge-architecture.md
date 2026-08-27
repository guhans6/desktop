# Web LLM Bridge Architecture

## Purpose

This fork narrows Agentify Desktop into temporary Stage 1 scaffolding for a **Web LLM Bridge**. The bridge carries text prompts and task/session results between callers and authenticated web LLM sessions. It is not a local capability or repository-context service.

```text
Codex / Visual Companion / caller
        |
        | delegate prompt
        v
Web LLM Bridge
        |
        | authenticated browser session
        v
ChatGPT / Claude / Gemini / ...
        |
        | Code MCP
        v
Project
        |
        | tool results
        v
Web LLM
        |
        | structured final result
        v
Web LLM Bridge
        |
        v
Original caller
```

## Responsibility split

| Component | Owns | Does not own |
| --- | --- | --- |
| Code MCP | approved local/project/repository operations | provider sessions or provider DOM compatibility |
| Web LLM Bridge | authenticated provider sessions and text transport | filesystem scanning, repo packing, context bundles, uploads, or task acceptance |
| Caller | prompt delegation, policy, and result acceptance | raw browser automation |

The intended public operation set is deliberately small:

```text
query(provider, key, prompt)
status(key)
stop(key)
tabs()
tab_create(...)
tab_close(...)
show(...)
hide(...)
```

`read_response(...)` may be added later when it is needed to expose a completed provider answer. Provider navigation remains internal. The bridge must not expose raw `navigate(any URL)`, arbitrary authenticated-page reading, arbitrary JavaScript execution, or generic file upload.

## Session model

Each provider conversation has a stable caller-owned key such as `<project>-<task>-<provider>` (for example, `whisperv-72-chatgpt`). Callers may reuse that key for follow-up work without manually managing browser chats.

## Delivery path

Stage 1 uses the existing Agentify browser/session implementation as a source donor rather than a permanent product commitment. First narrow the public surface and prove one real delegated loop. Only then extract the small, independently maintained bridge.
