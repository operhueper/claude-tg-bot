# Skill: Schedules (cron from chat)

## When to use
User says: "every day at 9", "every Friday", "remind me every hour", "run this weekly", etc.

## File: `{vaultDir}/.schedule.yaml`

```yaml
schedules:
  - name: morning_report        # unique name: a-z, 0-9, _ only
    cron: "0 9 * * *"           # min hour day month weekday (0=Sun)
    cmd: ["python3", "/vault/scripts/report.py"]
    notify: true                # true = send result to Telegram
    timeout: 300                # seconds, default 300

  - name: weekly_cleanup
    cron: "0 10 * * 1"          # Mondays at 10:00
    cmd: ["bash", "/vault/scripts/cleanup.sh"]
    notify: true
```

## Common cron patterns

| Expression | Meaning |
|---|---|
| `"0 9 * * *"` | Every day at 09:00 |
| `"30 8 * * 1-5"` | Weekdays at 08:30 |
| `"0 */2 * * *"` | Every 2 hours |
| `"0 18 * * 5"` | Fridays at 18:00 |
| `"0 0 1 * *"` | 1st of every month at midnight |
| `"*/15 * * * *"` | Every 15 minutes |

## Rules
- Schedules run **forever** — no 7-day or monthly expiry. They tick as long as the entry is in the file.
- Never tell user "it will only run for N days" — that's false.
- To delete a schedule: remove its entry from `.schedule.yaml` and save.
- Execution logs: `{vaultDir}/.schedule-runs/<name>-YYYY-MM-DD.log`
- To show user their schedules: display the contents of `.schedule.yaml`

## Timezone
Default: server timezone (Moscow, UTC+3). If user wants a different timezone, note it in the schedule name and adjust the cron hour accordingly.
