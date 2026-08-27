# Completion Contract

Provider text completion is a transport lifecycle signal, not proof that delegated project work is correct. The caller remains responsible for acceptance.

Delegated provider prompts should require a final machine-readable record, for example:

```json
{
  "bridge_status": "completed",
  "summary": "Short description of what was done",
  "verification": ["tests/build/checks performed"],
  "remaining": [],
  "needs_human": false
}
```

Allowed `bridge_status` values are `completed`, `blocked`, `needs_input`, and `failed`.

The bridge should eventually return both the raw provider response and parsed completion metadata. A caller may use that information to continue, request clarification, seek human attention, or independently verify the work.
