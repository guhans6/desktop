# Web LLM Bridge runtime

Issue #11 makes the normal Web LLM Bridge runtime independent of the inherited Agentify Electron shell.

## Normal runtime

`npm start` runs `node bridge-main.mjs`.

`bridge-main.mjs` starts the bridge-owned runtime in `bridge-runtime.mjs`, which composes only the authenticated provider-session path:

- Chrome CDP browser backend;
- isolated provider profile/session state;
- `TabManager` with the protected `default` ChatGPT conversation;
- `ChatGPTController`;
- localhost HTTP API;
- token/state persistence;
- truthful login/readiness reporting;
- controlled process-signal shutdown.

The headless runtime does not create an Electron `app`, `BrowserWindow`, Control Center, IPC surface, watch-folder manager, or local orchestrator. It always uses Chrome CDP even if a legacy settings file still names the Electron browser backend.

Its bridge-only HTTP surface is limited to health, provider readiness/status, and authenticated `default`-ChatGPT run delegation, status, result, and stop operations. It does not expose navigation, page reading, JavaScript execution, additional tabs/providers, local context or attachment paths, artifacts, or watch folders.

"Headless" here means independent of the Electron desktop shell. The managed Chrome provider window may still be shown when needed for manual sign-in, CAPTCHA, or other human attention.

## Legacy Electron fallback

`npm run start:desktop` still launches the inherited Electron shell. It remains available only as a compatibility/fallback path while the extraction is verified. Electron-specific UI and inherited generic local capabilities are not part of the normal bridge runtime. Broad removal of those leftovers belongs to the separately bounded post-proof cleanup work rather than Issue #11.

MCP auto-start now launches `bridge-main.mjs` with Node rather than bootstrapping Electron.
