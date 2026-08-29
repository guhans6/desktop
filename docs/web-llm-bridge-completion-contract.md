# Completion Contract

ChatGPT transport completion is a lifecycle signal, not proof that delegated project work is correct. The caller remains responsible for acceptance.

## Exact-turn completion

The bridge captures pre-send turn state, confirms the newly accepted user turn, binds the `runId` to the following assistant turn, waits until that turn is finalized, and extracts response text and outputs only from that turn. For ChatGPT, generic page text is not a valid completion fallback.

Active generation, login, CAPTCHA, and tool-confirmation states are not completion. Login, CAPTCHA, and consequential tool confirmations remain manual handoffs.

## Versioned final block

The start/end lines below are protocol delimiters, not encoding. They make the optional metadata footer unambiguous to a deterministic parser; they are not evidence that the provider task itself succeeded. See `web-llm-bridge-testing.md` for the separation between synthetic protocol fixtures and natural live-provider verification.

When a caller needs structured completion metadata, it may ask the assistant to finish with a versioned machine-readable block using unambiguous sentinels, for example:

```text
WEB_LLM_BRIDGE_COMPLETION_V1
{"bridge_status":"completed","summary":"Short description of what was done","verification":["tests/build/checks performed"],"remaining":[],"needs_human":false}
END_WEB_LLM_BRIDGE_COMPLETION_V1
```

Allowed `bridge_status` values are `completed`, `blocked`, `needs_input`, and `failed`.

The parser treats the versioned block as metadata embedded in the finalized assistant response. It does not search arbitrary JSON objects elsewhere in the response and must tolerate ordinary prose/code before the final block.

## Result semantics

A finalized run returns both the raw assistant response and parsed completion metadata. Successful transport, successful completion parsing, and caller acceptance are three distinct states.

If the assistant turn finalizes with no completion block, that is a normal response: the transport result remains `completed`, `rawResponse` is retained, `completion` is `null`, and no completion warning is added. If a completion block is present but malformed, `completion` is `null` and `warnings` records `completion_contract_invalid`. Parsing failure alone is not rewritten into a generic transport failure.

When `outputPolicy` is `capture`, the same run result may also include metadata and private cache paths for ChatGPT-generated files/images correlated to that exact assistant turn. A caller may use the raw response, completion metadata, artifacts, and warnings to continue, request clarification, seek human attention, or independently verify the work.
