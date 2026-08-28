# 05 — Add run lifecycle and exact turn correlation

**What to build:** Let callers create an independent run inside a reusable ChatGPT conversation and reliably observe or stop that run without confusing it with other turns or sessions.

**Blocked by:** 03 — Harden ChatGPT send confirmation and finalization.

**Status:** completed

- [x] Every delegation receives a unique `runId` separate from the stable conversation key.
- [x] Runs sharing a conversation key serialize FIFO while different keys may run concurrently subject to the existing governor.
- [x] Each run executes through the ChatGPT controller's exact accepted-user-turn and following-assistant-turn correlation.
- [x] Internal authenticated `/runs/status`, `/runs/result`, and `/runs/stop` operate by `runId`, not current-tab state.
- [x] Controller progress maps into `sending`, `working`, `needs_login`, `needs_captcha`, and `needs_tool_confirmation` run states.
- [x] Focused registry tests passed 5/5; final combined registry + HTTP lifecycle + ChatGPT regression verification passed 14/14.

The new run path intentionally accepts only the prompt transport needed for this slice: it does not use caller attachments, context paths, bundles, artifact ingestion, or arbitrary page capabilities. Legacy `/query` remains unchanged until the later public-surface cutover.

**Commit:** `cdf50179b0b8ab7ffab1fd6f8ff59869924594a3` (`feat: add ChatGPT run lifecycle`)
