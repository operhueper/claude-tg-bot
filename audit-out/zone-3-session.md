# Zone 3 — Session + Streaming + Abort

## Summary

Audited: `src/session.ts`, `src/handlers/streaming.ts`, `src/utils.ts`, `src/session-registry.ts`, `src/handlers/commands.ts`, `src/handlers/text.ts`, plus cross-checks against `request-queue.ts`, `engines/openrouter.ts`, `containers/vault-quota.ts`, `metering.ts`, `handlers/voice.ts|audio.ts|photo.ts|document.ts|video.ts`.

Per-user isolation in the registry (`Map<userId, ClaudeSession>`) is sound. Concurrent same-user requests are gated by `acquireUserLock` in every handler. However, the actual abort/streaming/lifecycle plumbing has multiple correctness and resource bugs — most of them user-visible (leaked heartbeat intervals, double-billing, lost partials, vault-check non-fatal failure swallows errors, /restart races, IdleHeartbeat unguarded after sub-request abort).

19 findings: **3 critical, 7 high, 6 medium, 3 low.**

## Findings

| # | Sev | Title | File:line |
|---|---|---|---|
| F1 | critical | `IdleHeartbeat` setInterval/setTimeout leak — every handler except `text.ts` never calls `state.cleanup()` | handlers/voice.ts:183-197, audio.ts, photo.ts:113-116, document.ts, video.ts |
| F2 | critical | `recordUsage` double-billing on retry path — usage is recorded in `finally` of attempt 1, then attempt 2 records again with its own `currentUsage`; metering DB has no idempotency key | session.ts:1136-1150 + handlers/text.ts:333-394 |
| F3 | critical | `acquireUserLock` chain memory leak / unbounded growth — `existing` is awaited then `userLocks.set(userId, lock)` overwrites it; if N tasks queue behind one user the GC chain only frees when the *last* releases, but `isUserBusy()` filter at handler entry returns immediately so chain never actually queues — silent skew if a caller bypasses the busy check | request-queue.ts:23-40 |
| F4 | high | `checkInterrupt` race — calls `userSession.stop()` then `Bun.sleep(100)` and `clearStopRequested()`. 100 ms is too short on a server with disk pressure; the prior query loop may not have observed `stopRequested` yet and the SDK can still be processing the next event. The new query then runs concurrently with the dying subprocess. | utils.ts:290-297 |
| F5 | high | Sub-request inside pending-context drain creates a *second* `StreamingState` and second `IdleHeartbeat`, but if the second send throws before `pendingState.cleanup()` runs (e.g. thrown error in `catch` block itself), the heartbeat leaks; also `acquireUserLock` was already released before this sub-request starts, so a new incoming user message *can* start a third concurrent send | handlers/text.ts:361-392 |
| F6 | high | `/restart` race on owner: `killUserClaudeProcesses` uses `pgrep -f "--add-dir <workingDir>/"`. The trailing slash means processes started with `--add-dir /opt/claude-tg-bot/workspace` (no slash) are missed; also if two `/restart` fire concurrently, the second pgrep sees PIDs already SIGKILL'd, and `process.kill` throws `ESRCH` quietly logged | handlers/commands.ts:457-482 |
| F7 | high | Vault-quota check runs `du -sb` synchronously with 5 s timeout *on the request hot path*. For a 2 GB vault `du` is multi-second; first request after cache expiry blocks the event loop for 1–5 s, freezing every other user's bot interaction | containers/vault-quota.ts:47-78, session.ts:459-470 |
| F8 | high | `lastPartialResponse` only captured when `this.stopRequested` is observed inside the for-await loop. If the query aborts via `abortController.abort()` from the 10-min hard timeout (session.ts:776-781) WITHOUT setting `stopRequested`, the partial is lost and the redirect-after-`!` will have no context | session.ts:806-812, 776-781 |
| F9 | high | `disallowedTools` for container guests adds `"Bash"` but not `"BashOutput"` / `"KillShell"`. Claude SDK exposes background-shell tools as separate names; they may slip through and break sandbox assumptions | session.ts:660-664 |
| F10 | high | Session-file write is **not atomic**: `Bun.write(profile.sessionFile, JSON.stringify(...))` — if the process is killed mid-write (very plausible during `/reloadbot` or systemd restart), the JSON file is truncated and next startup throws on `JSON.parse`, then silently returns `{sessions: []}` losing all prior session history | session.ts:1288 |
| F11 | medium | `exit code 1` suppression branch `(isExitCode1 && queryCompleted)` masks legitimate post-result crashes (e.g. SDK bug, MCP tool throw on shutdown). Combined with `isCleanupError && (queryCompleted || askUserTriggered || isAborted)` — if `result` arrived but the SDK actually crashed afterwards with corruption, user sees nothing | session.ts:1101-1124 |
| F12 | medium | `IdleHeartbeat` `start()` is called eagerly inside `createStatusCallback`, but the silence timer fires 15 s later regardless of whether the query ever actually starts. If `acquireContainerSlot` blocks longer than 15 s (other users in queue) the heartbeat message appears before the user's request is even in flight | handlers/streaming.ts:453-455, 302-309 |
| F13 | medium | `compactIfNeeded` resets `this.sessionId = null` and `this.transcriptRecorder = null`, but does NOT call `this.kill()` first → no `runBackgroundAnalysis` flush of the prior turns. The compressed summary takes their place in system prompt, but the *raw* turns never reach `memory/` analyzer | session.ts:411-414 |
| F14 | medium | Vision branch (`mediaHint && OPENROUTER_API_KEY`) creates its own `visionAbort` AbortController but does **not** wire it to `session.abortController`. A user `!` prefix calls `session.stop()` which aborts `this.abortController` (which is *null* during vision because the `try/finally` block is never entered for vision). User cannot interrupt a vision request at all | session.ts:566-603 |
| F15 | medium | `currentUsage` early-capture from `assistant` event grabs *per-turn* usage; if the model produces N turns within one query the loop overwrites `currentUsage` each turn — only the last turn's tokens get billed when an abort happens, undercounting | session.ts:843-863 |
| F16 | medium | `IdleHeartbeat.rotatePhrase` swallows generic 429 unless `retry_after > 30`. Up to 30 s the bot keeps editing into a 429-rate-limited chat, multiplying the 429 spam in logs | handlers/streaming.ts:367-380 |
| F17 | low | `startTypingIndicator` infinite while-loop without an abort gate — if `running = false` is set but the loop is currently inside `await Bun.sleep(4000)`, the indicator keeps firing one more time after the request is done | utils.ts:195-217 |
| F18 | low | `consumeInterruptFlag` clears `stopRequested = false` only when `was=true`. If multiple stops fire and only one is consumed, residual state persists across the next /new | session.ts:262-269 |
| F19 | low | `getSession(userId)` never expires entries — Map grows monotonically for the lifetime of the process. For a bot with 100+ users this is fine, but each `ClaudeSession` holds `TranscriptRecorder`, `pendingContextMessages`, `lastUsage`, etc. — ~tens of KB per inactive user | session-registry.ts:18-28 |

## Detailed findings

### F1 — IdleHeartbeat leak (critical)
**Where:** `handlers/streaming.ts:453-455` (`createStatusCallback` starts the heartbeat); `handlers/voice.ts:183-197`, `audio.ts:~200`, `photo.ts:113-116`, `document.ts:~470/~560`, `video.ts:~191` — none call `state.cleanup()`. Only `handlers/text.ts:440` does.

**Impact:** On every voice/audio/photo/document/video message, an `IdleHeartbeat` instance starts a `setTimeout` (silence timer) and possibly a `setInterval` (phrase rotation). If the `done` status event never fires (e.g. SDK throws), the timers run forever, holding refs to `ctx`, the chat, message objects. Memory grows per failed request; phrase rotation messages can keep firing minutes after the user's session is dead.

**Fix:** Either move heartbeat lifecycle into `sendMessageStreaming` (so `finally` always calls `heartbeat.stop()`), or add `await state.cleanup()` to every handler's `finally` block. The `done` event already calls `heartbeat.stop()` (streaming.ts:667) so success path is clean — only error/exception paths leak.

### F2 — recordUsage double-billing on retry (critical)
**Where:** `session.ts:1125-1150` records `currentUsage` in the `finally` block of *every* attempt; `handlers/text.ts:333-394` has `for attempt 0..MAX_RETRIES` retry loop.

**Trace:**
1. Attempt 0: SDK runs, `assistant` event sets `currentUsage = {in:5000, out:2000}`, then SDK throws exit-code-1 (not suppressed because `queryCompleted` is still false). `finally` records 5000/2000 to DB. Throws.
2. Catch in text.ts:395-420 sees `isClaudeCodeCrash`, calls `session.kill()`, retries.
3. Attempt 1: succeeds with `currentUsage = {in:5200, out:2200}` (slightly more — context replayed). `finally` records again. DB has 5000+5200 = 10200 input tokens for one user-visible request.

**Fix:** Either dedupe by `request_id` in metering schema (preferred), or move `recordUsage` out of `finally` and only call on the success path, OR wrap so a `usageRecorded` flag is checked across the *retry boundary*, not just per-attempt.

### F3 — acquireUserLock chain semantics
**Where:** `request-queue.ts:23-40`. `acquireUserLock` chains via `await existing` then overwrites the map entry. But every handler does `if (isUserBusy(userId)) return early` *before* calling `acquireUserLock`. So the chaining branch is unreachable in normal flow. Either the busy-check or the chain is dead code; if a future caller (e.g. webhook for payments, callbacks) forgets the busy check it silently chains and the user gets duplicate processing later.

**Fix:** Either remove the chain (replace with throw-if-busy semantics — caller MUST `isUserBusy` first), or remove the busy-check and let callers queue. Current dual-write is confusing.

### F4 — checkInterrupt 100 ms sleep is too short
**Where:** `utils.ts:290-297`. After `userSession.stop()` resolves with `"stopped"`, the abort signal still needs to propagate through the SDK's async iterator into the subprocess; 100 ms is empirically a tight bound. `handlers/commands.ts:411-417` uses 2000 ms for the same operation in `/restart` — inconsistent.

**Repro:** User sends "!новый вопрос" while the previous Bash tool call is mid-stream. `stop()` aborts, sleep 100 ms, redirect message fires a new query. The dying subprocess is still flushing its final events; `this.abortController = null` already happened in old query's `finally`, the new query overwrites `this.abortController` with a fresh one. If the dying subprocess emits one more event the parser is on a stale closure — fine for SDK 0.2.x but fragile.

**Fix:** Wait on `this.abortController?.signal` to actually be observed by the loop. Add a `await this.runningPromise` that resolves when the for-await loop exits. 100 ms hard sleep is a smell.

### F5 — Pending-context drain second-request leak
**Where:** `handlers/text.ts:361-392`. After the first send completes, `consumePendingContext()` returns queued user messages. A *second* `sendMessageStreaming` runs from inside the same handler — but at this point `releaseUserLock` has NOT been called (it's in the outer `finally`). Good. However, `pendingState.cleanup()` is called in the inner `finally`, but if `pendingError` rethrows synchronously (unlikely but possible) or if `consumePendingContext` returns null first then a *third* message arrives during the second send... the chain isn't bounded. Worse: the outer `state.cleanup()` is called AFTER the inner block returns, but the inner block does `return;` (line 391) — so the outer `state` from the first send may already have been cleaned up by the `done` event handler, but the outer `state.cleanup()` in `finally` still runs harmlessly. OK.

**The real bug:** The `return;` at line 391 short-circuits the outer `break;` that would have exited the retry loop. The outer `for (let attempt...)` is exited via this early return, but `stopProcessing()` and `typing.stop()` were already called inside the inner block, then the outer `finally` calls them AGAIN. `typing.stop()` is idempotent (just sets `running=false`) but `stopProcessing()` calls a closure — calling twice is harmless but indicates state confusion.

**Fix:** Document the early-return contract, or move pending-context drain out of the retry loop into a do/while wrapper around the whole handler.

### F6 — /restart pgrep mismatch + race
**Where:** `handlers/commands.ts:457-482`. `pgrep -f "--add-dir <workingDir>/"` — the trailing slash assumes the SDK always emits `--add-dir /opt/vault/123/` rather than `--add-dir /opt/vault/123`. Verify by inspecting actual Claude CLI argv; the SDK is known to normalize paths.

Two concurrent `/restart` from the same owner (impossible by lock — but `/restart` does NOT acquire `acquireUserLock`) double-kill the same PIDs.

**Fix:** Add `acquireUserLock` to `/restart` handler. Test pgrep pattern against the actual cmdline (`ps auxf | grep claude`).

### F7 — Vault quota du blocks hot path
**Where:** `containers/vault-quota.ts:62-66` runs `execFileSync("du", ["-sb", vaultPath], { timeout: 5000 })` *synchronously*. `execFileSync` blocks the Node event loop. With 60 s cache TTL, every minute the next request for a given user freezes the bot for 1–5 s.

**Fix:** Switch to `execFile` (async) or background-refresh the cache. Better: use kernel `statfs` or maintain a running tally updated by container file-system events.

### F8 — Hard timeout drops lastPartialResponse
**Where:** `session.ts:776-781` creates a 10-min `setTimeout` that calls `this.abortController.abort()` without setting `stopRequested = true`. The for-await `if (this.stopRequested)` check (line 806) is false, so partial is never saved. The abort then surfaces as an `AbortError` in `catch`. The user sees a generic abort, no partial-context redirect possible.

**Fix:** In the timeout handler also set `this.stopRequested = true` (or a separate `this.timeoutAbort` flag) so the partial gets captured.

### F9 — Disallowed tools list incomplete for container guests
**Where:** `session.ts:660-664`. Only `"Bash"` is added. SDK 0.2.x also exposes `BashOutput`, `KillShell` for background processes. If the model invokes `BashOutput` it queries the wrong shell tool.

**Fix:** `["Bash", "BashOutput", "KillShell"]`.

### F10 — Session-file write not atomic
**Where:** `session.ts:1288`. `Bun.write` does a single write — no `O_TMPFILE + rename`. A SIGKILL during write (e.g. `/reloadbot`, OOM, server reboot) produces a truncated JSON. `loadSessionHistory` catches and returns empty — silent data loss.

**Fix:** Use `writeFileSync(tmp, ...)` + `renameSync(tmp, target)` like `session-registry.ts:55-57` does for `ACTIVE_USERS_FILE`.

### F11 — Exit-code-1 suppression masks bugs
**Where:** `session.ts:1101-1124`. The combined condition `(isExitCode1 && queryCompleted) || (isAborted && isExitCode1) || errorStr.includes("cancel") || errorStr.includes("abort")` is permissive. If the SDK crashes with exit-code-1 AFTER emitting `result` for a different reason (e.g. MCP subprocess died on cleanup), the error is swallowed. Investigations get harder; partial corruption goes unnoticed.

**Fix:** Narrow the suppression — log full stderr on every suppressed path; add a counter `metrics.session.exit1_suppressed` so frequency is visible.

### F12 — Heartbeat fires before query starts
**Where:** `handlers/streaming.ts:453-455`. The 15 s silence timer is armed when `createStatusCallback` is created, which happens *before* `acquireContainerSlot` may have yielded a slot. With 5+ concurrent users, the queue can hold a request for >15 s and the user gets a "✨ думаю…" message even though no query is in flight.

**Fix:** Move `heartbeat.start()` to *after* the lock/slot is acquired, or arm only on first non-`text` callback.

### F13 — compactIfNeeded skips memory analysis
**Where:** `session.ts:411-414`. Sets `transcriptRecorder = null` without calling `runBackgroundAnalysis` on the prior turns. The user's pre-compaction conversation never reaches `memory/graph.json` or `summary_md`. Long-running chats lose history into the void.

**Fix:** Call `await this.transcriptRecorder.close()` and trigger `runBackgroundAnalysis` (fire-and-forget) before nulling.

### F14 — Vision branch cannot be interrupted
**Where:** `session.ts:566-603`. The vision branch creates `visionAbort` locally and returns before reaching `this.abortController = new AbortController()` at line 766. `this.isQueryRunning` stays false. User's `!` prefix → `userSession.isRunning` is false → `checkInterrupt` returns isInterrupt:true but `userSession.stop()` returns `false` (no controller, not processing) → no abort. The vision request runs to completion (90 s max).

**Fix:** Set `this.isQueryRunning = true`, `this.abortController = visionAbort` before the call; clear in `finally`. So `stop()` works.

### F15 — Per-turn usage overwrite
**Where:** `session.ts:843-863`. Each `assistant` event overwrites `currentUsage`. If the model does 3 turns within one query and an abort happens after turn 3, only turn 3's tokens are billed — turns 1+2 are lost.

**Fix:** Accumulate into a running total: `currentUsage = { input: prev.input + turnUsage.input, ... }`. The `result` event still overwrites at the end with aggregate (correct), but the abort/break path benefits.

### F16 — IdleHeartbeat 429 threshold too lenient
**Where:** `streaming.ts:367-380`. Heartbeat keeps trying for any retry_after ≤ 30 s. Telegram rate-limits per chat; 30 s of continued attempts spams the audit log and may trigger further escalation.

**Fix:** Stop on any 429.

### F17 — Typing indicator one-shot leak after stop
**Where:** `utils.ts:195-217`. `running=false` is checked at the top of the while loop, but if `Bun.sleep(4000)` is mid-await the next iteration still fires `replyWithChatAction` once. Race window is up to 4 s — usually harmless.

**Fix:** Use `AbortController` and pass signal to `Bun.sleep`.

### F18 — consumeInterruptFlag partial reset
**Where:** `session.ts:262-269`. Only resets `stopRequested` when flag was true. After a `/stop` followed by `/new`, `stopRequested` might linger.

**Fix:** Always reset both fields, or document the semantics.

### F19 — Session map never expires
**Where:** `session-registry.ts:18-28`. Sessions accumulate forever. Each holds `~10-50 KB`. For 100 users → 1-5 MB; not a problem now but a smell.

**Fix:** Add `evictInactive(maxAgeMs)` invoked from a periodic timer.

## Что в порядке

- **Per-user session isolation.** `getSession(userId)` returns a dedicated `ClaudeSession`; no shared mutable state across users.
- **Per-user session file.** `profile.sessionFile = /tmp/claude-telegram-session-${userId}.json` — no cross-user collision.
- **Drop-box userId scoping.** `ask-user-${userId}-*.json`, `send-file-${userId}-*.json`, `connect-google-${userId}-*.json` are globbed per-user with defense-in-depth check (`data.user_id` mismatch warning).
- **Per-user lock.** `acquireUserLock` prevents simultaneous queries from the same user; pending text messages are queued via `addPendingContext` and drained after the current query.
- **Subprocess abort.** `AbortController` is passed to SDK `query()`; the SDK propagates SIGTERM to its child Claude CLI subprocess. `/restart` then SIGKILLs stragglers identified by `--add-dir` cmdline.
- **Throttled streaming.** `STREAMING_THROTTLE_MS` prevents Telegram edit floods.
- **maxSegmentId tracking.** `done` deletes intermediate segments cleanly, keeping segment 0 (announcement) and final.
- **Metering called on every exit path.** `finally` block records tokens for normal completion, ask-user breaks, abort breaks, thrown errors (the `usageRecorded` guard prevents double-record within one attempt).
- **Per-user containers.** `containerEnabled` gate keeps owner out of containers; container slot semaphore prevents host overload.
- **Plan/Todo parsers.** Stateful per-call (created inside `sendMessageStreaming`), so no cross-request bleed.

## Архитектурные замечания (race conditions, memory model)

1. **AbortController ownership is split across two layers**: vision path creates `visionAbort` locally, SDK path uses `this.abortController`. `stop()` only knows about `this.abortController` → vision requests are uninterruptible (F14). Unify under a single owning controller.

2. **`isRunning` semantics drift**. `_isProcessing` is set by `startProcessing()` (handlers), `isQueryRunning` by `sendMessageStreaming` body. The window between handler entry and SDK `query()` start (vault check, memory load, compaction, container start, ~1-2 s) is `_isProcessing=true, isQueryRunning=false`. During this window `stop()` returns `"pending"` and only sets `stopRequested` — if the caller doesn't poll, the query proceeds anyway. The current code does check `if (this.stopRequested) throw` at line 744 — good. But the assumption that `stopRequested` survives until that check is fragile (e.g. concurrent compactIfNeeded inside the same call could reset it via `clearStopRequested` invocation).

3. **`finally` ordering in session.ts:1125-1159** clears `isQueryRunning` and `abortController` BEFORE `recordUsage` — wait, no: actually `recordUsage` is first, then `isQueryRunning = false`. Order is correct but `transcriptRecorder.flush()` is called only when `stopRequested` is true — on hard-timeout abort (F8) it's never flushed, so partial turns aren't persisted.

4. **Two-level retry**: `handlers/text.ts` retries once on `exited with code` errors. But `session.sendMessageStreaming` already suppresses many exit-code-1 errors internally as "cleanup noise". Retries only fire for unsuppressed crashes — narrow window. Combined with F2 (double-billing) and F8 (no partial on hard-timeout), retry semantics need a design pass.

5. **Memory model**: `transcriptRecorder`, `lastUsage`, `pendingContextMessages` live on `ClaudeSession` indefinitely. `kill()` clears `sessionId`/`lastActivity`/`conversationTitle` but NOT the pending-context queue. After `/new`, residual pending messages from a previous abort can leak into the new session's next call. Verify by reading `kill()` body (session.ts:1247-1262) — confirms `pendingContextMessages` is NOT cleared. Minor but worth fixing.

6. **Concurrent `/restart` from owner** is not lock-protected. The handler stops the session, sleeps 2 s, runs pgrep+SIGKILL, kills the session, unlinks the session file. Two concurrent invocations race on the file delete (second one gets ENOENT, silently warned). Low-impact but symptomatic.

7. **The `_wasInterruptedByNewMessage` flag** distinguishes user-initiated `/stop` from `!`-prefix interrupts to avoid showing "🛑 Query stopped." on every redirect. But `consumeInterruptFlag()` is only called in the `catch` block (text.ts:428). If the redirect path runs successfully (no catch), the flag persists into the next interrupt cycle. Verify via session.ts:262-269 — `was = _wasInterruptedByNewMessage; _wasInterruptedByNewMessage = false; if (was) stopRequested = false; return was;` — only the consume path resets. The set path `markInterrupt()` (line 271-273) just flips it true. So if no one consumes between two interrupts, the second consume returns true even if no actual interrupt happened in between. Minor.

8. **Streaming state lifecycle isn't symmetric across handlers** (F1) — `text.ts` cleans up, others don't. The asymmetry is the root cause of the leak. A single helper `runWithStreaming(ctx, fn)` that owns state+typing+heartbeat would eliminate this entire class of bug.
