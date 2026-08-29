# Web LLM Bridge Stage 1 Instructions

This fork is temporary scaffolding for a narrowly scoped Web LLM Bridge.

## Architecture boundary

- **Code MCP** owns approved repository, filesystem, command, build, test, and other local capabilities.
- **Web LLM Bridge** owns authenticated web-provider session transport only.
- **Callers** own delegation and acceptance policy.

Do not add local repository context, arbitrary filesystem access, attachment upload, artifact ingestion, watch folders, context bundles, raw browser navigation, arbitrary page reading, or arbitrary JavaScript execution to the bridge's public API.

## Stage 1 scope

The present Stage 1 baseline is documentation only. Preserve MPL-2.0 notices and upstream license material. Do not make branding or distribution decisions in this fork. Make later source changes in small, reviewable commits that follow the reduction map in `docs/`.

## Working principles

- Keep a Chrome CDP backend with an isolated, purpose-specific provider profile.
- Preserve stable provider-session keys and conservative rate/stop behavior.
- Keep login and CAPTCHA resolution as a manual handoff; never add bypass behavior.
- Treat provider generation completion as distinct from task acceptance. Return raw text plus parsed completion metadata.
- Use ordinary human-style prompts for behavioral and signed-in live verification. Keep synthetic sentinels/markers only in protocol fixtures where that format is itself under test, and never count the provider's self-reported success claims as verification evidence.
