# 10 — Reduce obsolete generic capabilities after proof

**What to build:** Once the complete ChatGPT-first loop is proven, incrementally remove unreachable generic context, upload, artifact-ingestion, watch-folder, arbitrary navigation/read, and stale orchestration paths without destabilizing the working v1 bridge.

**Blocked by:** 09 — Prove ChatGPT to Code MCP to caller end to end.

**Status:** ready-for-agent

- [ ] Public-surface removal precedes internal deletion for every capability class.
- [ ] Deletions land in small independently testable changes.
- [ ] Provider-originated output capture remains intact.
- [ ] Claude/other-provider internals are removed only when shared-code cleanup requires it or a later scope explicitly authorizes it.
