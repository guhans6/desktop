# Agentify Reduction Map

Agentify is a Stage 1 source donor. This map determines the staged reduction order; it is not authorization for one large deletion.

## Keep or adapt first

| Area | Stage 1 treatment | Reason |
| --- | --- | --- |
| `browser-backend.mjs` | keep initially | browser abstraction |
| `chrome-cdp-backend.mjs` | keep, preferred | isolated Chrome CDP provider session |
| `electron-browser-backend.mjs` | reference / optional fallback | avoid depending on embedded-login compatibility |
| `chatgpt-controller.mjs` | keep, then recheck | provider interaction and compatibility |
| `tab-manager.mjs` | keep | stable keyed sessions |
| `popup-policy.mjs` | keep while relevant | provider login flow support |
| `vendors.json` and `selectors.json` | keep/adapt | provider routing and DOM selectors |
| `state.mjs` | reduce later | retain browser/session/runtime state only |
| `http-api.mjs` | reduce heavily | lifecycle, governor, status, and stop logic are useful |
| `mcp-server.mjs`, `mcp-lib.mjs` | rewrite surface | enforce the narrow bridge API |
| `config.mjs`, governor behavior | keep conservatively | pacing and safety |
| `shutdown.mjs` | keep | controlled teardown |
| `ui/` | keep minimally | Control Center for provider login/profile/session management |

## Remove from the public bridge surface

```text
attachments
contextPaths
local repo packing
arbitrary local path inputs
context bundles
watch folders
artifact ingestion and storage
generic local file upload
repo orchestration
arbitrary filesystem scanning
arbitrary navigation
generic page reading
```

## Remove implementation paths incrementally

```text
context-packer.mjs
bundle-store.mjs
watch-folder.mjs
artifact-store.mjs
orchestrator.mjs
orchestrator/*
```

The public API must reject removed capabilities before their internal modules are deleted. That sequence makes the boundary real while keeping each follow-up change reviewable.
