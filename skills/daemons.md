# Skill: Daemons (always-on programs)

## When to use
User wants a program to run continuously: Telegram bot, web server, API listener, background worker, etc.

## File: `{vaultDir}/.daemons.yaml`

```yaml
daemons:
  - name: my-bot               # unique name: a-z, 0-9, - only
    cmd: ["python3", "bots/main.py"]
    workdir: /vault             # optional, defaults to vaultDir
    env:                        # optional environment variables
      TOKEN: "abc123"
      DEBUG: "false"
    enabled: true

  # bot-scheduler is reserved — never remove or disable it
  - name: bot-scheduler
    cmd: ["/usr/local/bin/bot-scheduler"]
    enabled: true
```

## Rules
- **Max 3 user daemon slots** (bot-scheduler is the 4th, reserved — never touch it).
- If user already has 3 daemons: ask which one to disable before adding a new one.
- Set `enabled: false` to pause without deleting.
- After writing the file, the daemon starts within ~5 seconds automatically.
- Logs: `{vaultDir}/logs/<name>.log` and `{vaultDir}/logs/<name>.err.log`

## IMPORTANT: test before enabling

Before setting `enabled: true`, run the command manually first:
```bash
cd /vault && python3 bots/main.py
# Wait 5–10 seconds, then Ctrl+C
```
If it crashes immediately (import error, config error) — fix it first, THEN set `enabled: true`.
This prevents false crashloop alerts.

## Crashloop protection
If a daemon crashes 5+ times in 10 minutes (with uptime ≥5s each time) → it moves to STOPPED state automatically.
To recover: fix the bug, then read the log (`{vaultDir}/logs/<name>.log`) and re-enable.

## Do NOT use
- `nohup`, `&`, `screen`, `tmux` for daemons — they won't survive container restarts.
- Only the `.daemons.yaml` manifest persists across restarts.
