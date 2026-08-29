# Web LLM Bridge testing

The bridge should be verified in a way that resembles ordinary use. Tests must not make ChatGPT certify the transport properties that the test itself is supposed to observe.

## Test layers

### Protocol and pure unit tests

Synthetic fixtures are appropriate when the protocol itself is under test. Examples include completion sentinels, malformed JSON, cache limits, hashes, MIME validation, invalid modes, and invalid output policies.

These tests prove deterministic parsing, validation, and storage behavior. They do not prove that the live ChatGPT UI behaves correctly.

### Behavioral controller and HTTP tests

When prompt content is not the subject of the test, use ordinary human-style requests and plausible assistant responses. Avoid opaque one-character prompts, issue-number markers, forced exact reply tokens, or text that tells the assistant to claim that verification succeeded.

Assertions should observe bridge behavior directly: the prompt is forwarded unchanged, the requested mode is verified, exactly one user turn is accepted, the following assistant turn is selected, the raw response is preserved, and output-capture errors remain warnings.

### Signed-in live verification

When visible provider UI state is part of a live/browser acceptance claim, preserve one focused screenshot of the relevant exact-turn state before teardown and record its path with the run evidence. The screenshot is supporting evidence alongside DOM/API/cache evidence, not a substitute for machine-verifiable assertions. Unit and pure protocol tests do not need screenshots unless rendering itself is the subject under test.

Live acceptance uses a normal request a person could reasonably send in ChatGPT. For provider-output capture, ask for a simple file in ordinary language, for example:

> Please make a small text note called `bridge-check-note.txt` containing the sentence “The bridge check finished successfully.” Attach the file here when it is ready, then give me a short confirmation.

The verifier, not ChatGPT, decides whether the gate passed. It must derive evidence from the bridge/API, picker state, exact-turn DOM, browser download events, and private cache. Do not ask ChatGPT to say that the mode was verified, the prompt was sent once, a file was captured, permissions are private, or a hash matched.

A live output-capture gate passes only when the correlated assistant turn visibly exposes the provider output and the bridge captures that same output into the run cache. A textual statement such as “the file is ready” is not artifact evidence.

## Completion metadata

The `WEB_LLM_BRIDGE_COMPLETION_V1` and `END_WEB_LLM_BRIDGE_COMPLETION_V1` lines are protocol delimiters, not encoding. They exist so a parser can unambiguously separate a final JSON metadata object from ordinary response prose.

Completion-contract parser tests should use those delimiters because that is the format being tested. General live transport/output tests should not force a completion block merely to manufacture a deterministic response. They may instead produce `completion: null` with no completion warning; completion parsing is verified independently by protocol and HTTP integration tests.

If a future end-to-end scenario specifically needs to test completion metadata against the live provider, keep the human task natural and treat the completion footer as a separate protocol concern. Never put claims such as “exact-turn capture succeeded” into the requested completion metadata and then count those claims as evidence.

## What the main checks prove

- `/health`: the bridge HTTP process is serving.
- authenticated `/status`: the protected provider session is reachable and its login/readiness state is being reported truthfully.
- picker verification: the requested ChatGPT mode was observed from the real picker rather than inferred from unrelated UI text.
- one-new-user-turn check: the bridge did not accidentally submit the prompt twice.
- following-assistant-turn correlation: `/runs/result` belongs to the assistant turn caused by that run, not an older or unrelated message.
- raw-response equality: the bridge preserved provider output rather than replacing it with a parsed or summarized form.
- completion parser tests: the optional versioned metadata footer is parsed or warned about without changing successful transport semantics.
- provider-output capture: a file/image visible from the exact assistant turn was downloaded through the authenticated browser session and stored in the bounded run cache.
- cache path, hash, size, and permissions: the retained output is the expected bytes and is private bridge-owned temporary state.
- `/shutdown`: the API acknowledges shutdown before teardown and the runtime cleans up normally.
- full regression suite: the new runtime behavior did not break the repository's automated contracts.

No single one of these checks proves caller acceptance or that delegated project work is correct. Acceptance remains the caller's responsibility.
