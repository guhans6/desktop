# Agentify Reduction Map

Agentify is a Stage 1 source donor. This map determines the staged reduction order after the ChatGPT-first loop is proven; it is not authorization for one large deletion. The execution sequence and blockers are defined in `web-llm-bridge-chatgpt-v1-plan.md`.

## Keep or adapt first

| Area | Stage 1 treatment | Reason |
| --- | --- | --- |
| `browser-backend.mjs` | keep initially | browser abstraction |
| `chrome-cdp-backend.mjs` | keep, preferred | isolated Chrome CDP ChatGPT session and browser-session-aware output capture |
| `electron-browser-backend.mjs` | reference / optional fallback | avoid depending on embedded-login compatibility |
| `chatgpt-controller.mjs` | keep and harden first | ChatGPT interaction, send confirmation, turn correlation, mode selection, and output discovery |
| `tab-manager.mjs` | keep/adapt | stable keyed conversations; later pair with separate run identity |
| `popup-policy.mjs` | keep while relevant | provider login flow support |
| `vendors.json` and `selectors.json` | keep/adapt | current provider routing and DOM selectors; v1 public surface remains ChatGPT-only |
| `state.mjs` | reduce later | retain browser/session/runtime/run state only |
| `http-api.mjs` | adapt before reducing | lifecycle, governor, status, stop, and long-lived run registry belong here or behind this process boundary |
| `mcp-server.mjs`, `mcp-lib.mjs` | rewrite surface after internal run APIs exist | enforce the narrow ChatGPT v1 bridge API |
| `artifact-store.mjs` | source material only; replace before deletion | current generic artifact behavior is not the v1 per-run provider-output cache |
| `config.mjs`, governor behavior | keep conservatively | pacing and safety |
| `shutdown.mjs` | keep | controlled teardown |
| `ui/` | keep minimally | ChatGPT login/profile/session and manual attention management |

Issue #11 changes the normal runtime boundary: `bridge-main.mjs` / `bridge-runtime.mjs` now own Node + Chrome-CDP provider-session startup without Electron. `bridge-http-api.mjs` limits normal startup to the protected default ChatGPT session and run transport instead of inheriting the desktop API's navigation, filesystem, artifact, tab, and watch-folder routes. The inherited Electron shell remains only as an explicit compatibility fallback (`npm run start:desktop`) pending separate cleanup; it is not required for normal bridge operation.

## Remove from the public bridge surface

```text
caller-local attachments
contextPaths
local repo packing
arbitrary caller path inputs
context bundles
watch folders
generic artifact ingestion, reuse, and listing
caller-specified output directories
generic local file upload
repo orchestration
arbitrary filesystem scanning
arbitrary navigation
generic page reading
```

Provider-originated output capture is explicitly retained. It is limited to files/images produced by the exact assistant turn associated with a `runId` and stored in a bridge-owned bounded per-run cache. It must not become a generic artifact store or local-input path.

## Remove implementation paths incrementally after proof

```text
context-packer.mjs
bundle-store.mjs
watch-folder.mjs
legacy generic artifact-store paths after the per-run output cache replaces them
orchestrator.mjs
orchestrator/*
```

Do not begin these broad deletions until the signed-in ChatGPT -> Code MCP -> caller proof succeeds. Public-surface narrowing and internal deletion remain separate changes. The public API must make removed capability classes unavailable before their implementation paths are deleted.
