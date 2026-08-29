# 02 — Re-establish the dependency and test baseline

**What to build:** Establish a fresh local verification baseline with project dependencies installed so every later ChatGPT change can be compared against a known test result.

**Blocked by:** 01 — Document the ChatGPT-first v1 boundary.

**Status:** ready-for-agent

**Current blocker:** Code-MCP currently denies trusted-host execution for the registered `web-llm-bridge` workspace. Project-root reconciliation succeeded, but dependency/test execution still requires Developer-owned host trust for this exact repository identity.

- [ ] Project dependencies are installed from the lockfile without intentional dependency upgrades.
- [ ] The full baseline test suite is run and its pass/fail result is recorded with any environmental failures explained.
- [ ] Dependency installation does not introduce unintended tracked source changes.
