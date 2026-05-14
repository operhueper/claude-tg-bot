# Error Paths & Failure Modes — 2026-05-14

## Scope
How the bot behaves when external dependencies fail, disk is full, OOM, network down, partial writes.

---

## 1. Telegram API 429 (rate limit)

**Where handled:** `src/handlers/streaming.ts` `createStatusCallback` → `done` event block.

**Behaviour:**
- On 429 during `deleteMessage` (tool/text segment cleanup), the loop sets `rateLimited = true` and **aborts remaining deletions**. The message is logged as warning, not retried.
- On 429 during `editMessageText` (streaming intermediate updates), the error is silently swallowed via `console.debug`. No retry, no backoff.
- `IdleHeartbeat.rotatePhrase` has special 429 handling: if `retry_after > 30`, it calls `this.stop()`. For smaller values it does not stop and continues editing every 10 s.
- **No global retry/backoff logic exists for Telegram API calls.** grammY itself may implement internal retry for some operations, but the bot code does not.

**Risk:** If Telegram rate-limits the bot for a specific chat (long streams with many segments), tool messages and intermediate segments remain visible in the chat. The final answer is still delivered.

---

## 2. Telegram API 5xx

**Where handled:** `bot.catch` in `src/index.ts` — logs `console.error("Bot error:", err)` and discards. No retry, no user notification.

**Behaviour:**
- grammY's internal polling loop retries on network errors with exponential backoff.
- Individual `ctx.reply()` failures inside handlers are mostly uncaught at the outer level (only caught inside `createStatusCallback`'s outer try/catch which logs `console.error("Status callback error:", error)`).
- If `ctx.reply()` throws inside a handler's `catch (error)` block, the error is lost silently — e.g. in `voice.ts` the catch block itself calls `ctx.reply()` without its own catch.

**Gap:** A 5xx on the final `ctx.reply` in an error handler results in silent failure — the user sees nothing.

---

## 3. DeepSeek/OpenRouter timeout

**Where handled:** `src/session.ts` — 10-minute `queryTimeoutMs` AbortController. `src/engines/openrouter.ts` — 90-second `AbortSignal.timeout(90_000)` per round.

**Retry behaviour:**
- `src/handlers/text.ts` has `MAX_RETRIES = 1` — one retry on Claude Code crash (`exited with code`). DeepSeek/OpenRouter timeouts do NOT match this pattern so they fall to the final `replyFriendly` path. **No retry for API timeouts.**
- OpenRouter agentic loop: up to `MAX_TOOL_ROUNDS = 10` rounds. Each round has its own 90-second timeout. Total wall-clock could be up to 900 seconds before the outer 600-second session timeout fires.
- Metering is recorded in `finally` of `sendMessageStreaming` using whatever `currentUsage` was captured at the point of abort. For a mid-stream abort after some tokens were used, the partial usage is billed via `INSERT OR REPLACE`. This is correct, but if the abort fires before any assistant event, `currentUsage` is null and no billing happens — no inflated billing risk.

**Risk:** No retry on transient API failures means the user gets an error message on intermittent 5xx or short outages.

---

## 4. OpenAI Whisper failure

**Where handled:** `src/utils.ts` `transcribeVoice` — `catch` returns `null`.

**Behaviour in `voice.ts`:**
```
const transcript = await transcribeVoice(voicePath);
if (!transcript) {
  await ctx.api.editMessageText(chatId, statusMsg.message_id,
    "❌ Не удалось расшифровать голосовое. Попробуй ещё раз.");
  return;
}
```
The voice file (`voicePath`) is deleted in `finally` — so the file is always cleaned up regardless of transcription failure.

**Gap:** The `return` inside the `if (!transcript)` block exits the handler before `return` can reach the `finally`. Wait — actually the `finally` still runs on `return` in JS. The file IS deleted. No leak.

**Additional gap:** The `statusMsg` edit inside the null-transcript branch does not itself have a try/catch. If Telegram rejects the edit (e.g., message already deleted), an unhandled promise rejection can surface. It's caught by `process.on('unhandledRejection')` but no user-visible error would appear.

---

## 5. Disk full — /tmp or audit log

**`appendFile` in `src/utils.ts` `writeAuditLog`:**
```javascript
try {
  const fs = await import("fs/promises");
  await fs.appendFile(AUDIT_LOG_PATH, content);
} catch (error) {
  console.error("Failed to write audit log:", error);
}
```
Audit log write failure is **swallowed** — logged to console, request continues normally. No ENOSPC propagation to user.

**`saveSession` in `src/session.ts`:**
```javascript
} catch (error) {
  console.warn(`[${this.profile.label}] Failed to save session: ${error}`);
}
```
Session file write failure is silently swallowed. The session continues but `/resume` will be unable to find the session after restart.

**`writeFileSync` in `src/containers/manager.ts` `ensureProjectSettings`:**
No try/catch around `writeFileSync(settingsPath, ...)`. An ENOSPC here would propagate to the caller `getOrStartUnlocked` which has no catch either. It would propagate to `getOrStart` → `withLock` → `getOrStartUnlocked` → **throws**. Caller in `session.ts`:
```javascript
try {
  await containerManager.getOrStart(this.profile);
} catch (err) {
  console.warn(`...container getOrStart failed (will continue...)`);
}
```
So container start failure is swallowed — session continues but `mcp__container__Bash` calls will fail per-request.

**`recordUsage` in `src/metering.ts`:** Wrapped in try/catch, errors go to `console.error`. DB write failure is silently skipped — token usage is unaccounted.

**Image generation (`openrouter.ts` `generate_image`):**
`fs.writeFileSync(imgPath, Buffer.from(buffer))` — no try/catch. On ENOSPC this throws, caught by outer `executeToolAsync` catch which returns `Error: ${message}` string to the model. The model likely retries or reports the error.

---

## 6. Docker daemon dead

**`ensureDocker` in `src/containers/manager.ts`:**
If `docker --version` fails, `dockerAvailable = false`, all public methods return sensible defaults and log a single warning. Per-request `exec()` returns `{ stdout: "", stderr: "Error: Docker is not available", exitCode: 127 }`.

**User visibility:**
The `mcp__container__Bash` MCP gets the error result string from `exec()`, passes it back to the model as tool output. The model then reports to the user in natural language. **No friendly error reply is sent directly** — the user eventually gets the model's interpretation of the error. This is acceptable UX but creates an indirect error path that could be confusing.

**Circuit breaker:** 5 consecutive exec timeouts in 5 minutes → force `docker kill + start`. If Docker daemon is completely dead, the kill+start itself will fail silently (`.catch(() => {})`) and the counter resets — the circuit breaker fires repeatedly without recovery.

---

## 7. OOM — Bun process

**No OOM guard exists** in the bot code. Observations:

- `addPendingContext` in `session.ts` caps the queue at 5 messages / 5000 chars, preventing one unbounded growth vector.
- Streaming state (`StreamingState`) accumulates `textMessages`, `toolMessages` maps. On a very long session (500+ tool calls), these grow without cleanup. The `done` handler deletes Telegram messages but the JS objects remain in the Map.
- `conversationMessages` in `openrouter.ts` `queryOpenRouter` grows with each tool round (up to 10 rounds). At 10 rounds with large tool outputs (8000 chars each), this is ~80KB — acceptable.
- `transcript` recorder accumulates turns indefinitely (no cap). On a 5-hour session with 300 turns, each turn storing full text, this could reach tens of MB.
- **Node/Bun OOM kills the process.** `process.on('uncaughtException')` calls `process.exit(1)`. Systemd will restart the service. Users lose their active session.

---

## 8. Partial SQLite write — `recordUsage`

**`metering.ts` uses Bun's SQLite driver with WAL mode and `busy_timeout=5000`.**

- `recordUsage` is synchronous (`db.run()`). Bun SQLite is single-threaded per connection — no two runs can interleave on the same `db` instance.
- WAL mode means readers don't block writers. `busy_timeout=5000` means the writer retries for 5 seconds on `SQLITE_BUSY` before giving up (but the error is caught and logged).
- **Partial write scenario:** If the process is killed mid-`db.run()`, SQLite WAL guarantees the transaction is atomic — either the row is written or not. No partial rows.
- **Two process scenario:** Two bot instances pointing at the same `metering.sqlite` are not expected but could happen if systemd races a restart. WAL handles concurrent writes via `busy_timeout`. If both timeout, one will log an error and the usage record is dropped.

---

## 9. Memory leak in long session

**Identified accumulation vectors:**

1. `TranscriptRecorder` (`session.ts`): `turns[]` array grows indefinitely. No trim in `appendUser`/`appendAssistant`. After 6+ hours and 100+ turns at ~500 chars/turn = ~50KB. After a day of heavy use could reach MB range.
2. `StreamingState.textMessages` Map: cleaned up at `done`, but if `done` is never called (e.g. process crash mid-stream), the Map is never released.
3. `deepseek-key-pool.ts` (not read, but likely): in-flight counters could leak if `release()` is never called. `withDeepSeekPoolKey` has `finally { dsPool.release() }` in `sendMessageStreaming` — properly protected.
4. `runBackgroundAnalysis` launched via `.catch()` chains — fire-and-forget. If it runs continuously every 6 turns on an active session, and each run creates new `GraphStore`/`GoalsStore` instances that load files from disk, the async tasks could pile up if file I/O is slow.

---

## 10. Crash during message send (partial delivery)

**Scenario:** Bot sends 3 streaming segment messages, crashes mid-send.

**Behaviour:**
- grammY's `run()` runner (from `@grammyjs/runner`) provides internal error recovery — it logs handler errors via `bot.catch` and continues polling. A crash that throws inside a handler is caught by grammY's middleware pipeline, logged, and the next update is processed.
- `process.on('uncaughtException')` calls `process.exit(1)` — systemd restarts. The user sees partial messages in Telegram (whatever was sent before the crash) with no "done" signal. Tool/thinking messages are NOT deleted — they remain visible.
- **Gap:** There is no cleanup mechanism for orphaned streaming messages after a crash. After restart, the user can `/new` to start fresh, but old "noise" messages from the crashed stream remain in the chat.

---

## 11. Database lock — two processes on metering.sqlite

**See §8.** SQLite WAL + `busy_timeout=5000` handles concurrent access. Each write retries for 5 s. If both timeout, the second write is dropped and logged to stderr. No data corruption, but billing records can be missed.

**Additional: parallel users writing simultaneously:**
The bot is single-process. Multiple users' `recordUsage` calls are serialized through Bun's event loop — there is no true concurrency at the JS level for synchronous SQLite calls. No lock contention within a single process.

---

## 12. Telegram bot blocked by user

**`bot.catch` handler:** `console.error("Bot error:", err)` — all grammY errors including "bot was blocked by the user" (Telegram error 403) are logged and discarded. No user notification possible (the user blocked the bot — they can't receive messages).

**Restart notifications (`index.ts`):**
```javascript
try {
  await bot.api.sendMessage(chatId, "Извини...");
} catch (e) {
  console.warn(`Failed to send restart notification to ${userId}: ${e}`);
}
```
Correctly handles 403/blocked with a warn-and-continue.

**Risk:** If a user blocks the bot mid-stream (after `ctx.reply` for the first segment), subsequent `editMessageText` calls on that message will fail with 403. These are caught at `console.debug` level in the streaming callback, so the error is swallowed silently — correct behaviour.

---

## 13. Network down — all outbound requests fail

**Scenario:** VPS network interface goes down or DNS fails.

**Impact:**
- `query()` SDK subprocess attempts to reach DeepSeek/Anthropic API → subprocess exits with error → `sendMessageStreaming` catch block fires → `isCleanupError` is false → `throw error` → propagates to handler → `replyFriendly` (but `replyFriendly` itself calls `ctx.reply()` which also requires network) → `ctx.reply` throws → swallowed in handler's outer try/catch → user sees nothing.
- Actually: `replyFriendly` calls `ctx.reply()` which calls Telegram API. With network down, this also fails. In `text.ts`, the outer `try { for(attempt...) }` has `finally` but the catch calls `replyFriendly` which can throw. That throw would bubble to grammY's middleware which calls `bot.catch` → `console.error`. **The user sees no error message.**
- `startTypingIndicator` runs every 4 seconds, its `ctx.replyWithChatAction` throws on network failure → caught via `console.debug("Typing indicator failed:", error)` → loop continues indefinitely (running=true, network still down).
- **Gap:** Typing indicator loop never stops if network comes back but `stop()` was already called. Actually `stop()` sets `running = false` which terminates the loop on next iteration — this is fine.
- Audit log write to a local file (not network-dependent) succeeds even during network outages — the local file survives.

**Recovery:**
- grammY's `run()` runner retries polling with exponential backoff on network errors. When network recovers, polling resumes and new messages are processed.
- Active sessions are lost — AbortControllers fire on timeout (10 min), `isQueryRunning` is reset, sessions are unblocked.

---

## Summary Table

| Vector | User sees error? | Data safe? | Resource leak? |
|--------|-----------------|------------|----------------|
| TG 429 | No (silent) | Yes | Orphan messages in chat |
| TG 5xx | Sometimes | Yes | No |
| DS/OR timeout | Yes (replyFriendly) | Yes (partial billing) | No |
| Whisper fail | Yes (edited message) | Yes | No |
| Disk full /tmp | No (swallowed) | Session may not save | No |
| Disk full audit | No (swallowed) | Audit missing | No |
| Docker dead | Indirect (via model) | Yes | No |
| OOM | No (process crash) | Session lost | No |
| SQLite partial | No | Billing record dropped | No |
| Long session | No | Yes | TranscriptRecorder grows |
| Crash mid-send | No | Partial messages in TG | Orphan TG messages |
| DB lock 2proc | No | One billing record dropped | No |
| Bot blocked | No | Yes | No |
| Network down | No | Yes | Typing loop if lingering |

---

## Key Findings

**EP-01 (MEDIUM):** Typing indicator in `utils.ts` catches typing errors at `console.debug` level — correct. But the loop is created as a fire-and-forget async function with no reference kept other than the `running` flag. If `stop()` is called while the `Bun.sleep(4000)` is in progress, the loop will complete one more iteration before stopping. This is by design but means `replyWithChatAction` can fire after the response is sent.

**EP-02 (LOW):** `writeAuditLog` failure is swallowed. On ENOSPC, audit records are silently dropped with no operator alert.

**EP-03 (MEDIUM):** Voice handler `statusMsg` edit on transcription failure has no try/catch. An unhandled rejection from `ctx.api.editMessageText` could surface and trigger the unhandledRejection counter toward the 10/60s crash threshold.

**EP-04 (LOW):** `replyFriendly` called inside error handlers can itself throw if Telegram API is down, resulting in the user seeing nothing. The error is caught by grammY's `bot.catch` but no fallback delivery exists.

**EP-05 (MEDIUM):** `TranscriptRecorder` has no size cap. A 5-hour continuous session could accumulate 50-200KB of transcript in memory. Not immediately dangerous but contributes to gradual memory growth in long-running production deployments.

**EP-06 (LOW):** `ensureProjectSettings` uses `writeFileSync` without try/catch. On ENOSPC this throws into `getOrStartUnlocked`, which is caught by the session-level warning and swallowed — but the settings file is not written, and Claude Code will operate in a permission-denied state for that guest until the file is eventually written.

**EP-07 (INFO):** Orphan Telegram messages (tool status, intermediate text segments) accumulate in chat after a process crash. No cleanup mechanism exists. Manual `/new` clears the session but doesn't delete old TG messages.

**EP-08 (LOW):** `queryOpenRouter` metering records usage without a `requestId` (no deduplication). If the network blips after tokens are consumed but before the response returns, the caller would retry and double-bill. The main `sendMessageStreaming` path uses `meteringRequestId` for deduplication but the OpenRouter path in `engines/openrouter.ts` calls `recordUsage` directly without one.
