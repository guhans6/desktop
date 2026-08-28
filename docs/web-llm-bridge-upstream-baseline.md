# Upstream Baseline

| Item | Value |
| --- | --- |
| Upstream repository | `https://github.com/agentify-sh/desktop` |
| Reviewed release | `v0.2.4` |
| Reviewed SHA | `d20e2e3fed6677cc5b4df1c03dd37d2b8161e1dd` |
| Upstream `main` at Stage 1 setup | `d20e2e3fed6677cc5b4df1c03dd37d2b8161e1dd` |
| License | MPL-2.0 |

At setup time, upstream `main` equals the reviewed baseline, so there are no changes in `d20e2e3..upstream/main` to assess. Preserve the existing MPL-2.0 license and all applicable notices in modified source files. Agentify trademarks and branding are distinct from the source license; this Stage 1 pass makes no branding or distribution decision.

## Verification state

The last observed baseline run before this documentation update was `npm test`: 156/159 tests passed. The three failures were caused by the absent local `electron` dependency and affected the optional Electron backend/launcher tests; preferred Chrome CDP tests passed.

On 2026-08-28, a fresh dependency install and full-suite rerun were attempted as the next Stage 1 step, but Code-MCP denied host execution because the registered `web-llm-bridge` workspace has not been granted trusted-host execution for its exact repository identity. Project-root reconciliation succeeded but did not grant that execution trust. No dependency or test command was bypassed through another execution surface.

Until that trust is granted and the suite is rerun, 156/159 remains the last observed test baseline rather than a fresh post-install baseline.

## Provider reliability watchlist

- [PR #57](https://github.com/agentify-sh/desktop/pull/57), “Fix ChatGPT duplicate sends and premature response completion,” is open. It proposes authoritative user-turn send confirmation, transient-response handling, and explicit assistant-turn completion checks.
- [Issue #60](https://github.com/agentify-sh/desktop/issues/60), “Consider direct ChatGPT send-button click before humanized mouse fallback,” is open. It documents a visible-send-button stall in the humanized CDP click path.

Neither change is part of the current upstream source baseline. Re-evaluate and port only relevant fixes during the dedicated provider-reliability stage.
