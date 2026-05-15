# Request Profiler

Lightweight per-request timestamp tracer. Zero overhead when disabled.

## Enable

Add to `.env`:

```
PROFILER_ENABLED=true
```

Restart the bot. Every completed text request writes a JSON trace file.

## Read traces

```bash
ls /tmp/perf-trace-*.json
cat /tmp/perf-trace-<userId>-<startMs>.json
```

## Trace format

```json
{
  "userId": 123456,
  "kind": "text",
  "startMs": 1747300000000,
  "marks": [
    { "t": 12,    "label": "lock_acquired" },
    { "t": 15,    "label": "rate_limit_ok" },
    { "t": 18,    "label": "session_obtained" },
    { "t": 20,    "label": "before_query" },
    { "t": 2100,  "label": "claude_cli_started" },
    { "t": 4300,  "label": "first_token" },
    { "t": 28000, "label": "final_text_segment" },
    { "t": 28100, "label": "done" }
  ],
  "totalMs": 28456
}
```

`t` = milliseconds elapsed since request start.

## Key marks

| Mark | Where set | What it measures |
|------|-----------|-----------------|
| `lock_acquired` | text.ts | User lock wait |
| `rate_limit_ok` | text.ts | Rate + container slot wait |
| `session_obtained` | text.ts | Session registry lookup |
| `before_query` | text.ts | Total pre-query overhead |
| `vision_routed` | session.ts | Vision path chosen |
| `claude_cli_started` | session.ts | SDK `query()` invoked |
| `first_token` | session.ts | Time to first text chunk from model |
| `first_tool_call` | session.ts | Time to first tool_use block |
| `final_text_segment` | session.ts | Result event received |
| `done` | session.ts | statusCallback("done") about to fire |
| `openrouter_fetch_sent_rN` | openrouter.ts | Fetch sent (round N) |
| `openrouter_fetch_done_rN` | openrouter.ts | Fetch complete (round N) |

## Disable

Remove `PROFILER_ENABLED=true` from `.env` and restart. No files are written.
