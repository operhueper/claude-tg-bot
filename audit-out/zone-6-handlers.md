# Zone 6 — Message handlers

## Summary

Overall the handlers are structurally sound. Auth, rate-limiting, and lock acquisition follow a consistent pattern across all six handlers. `replyFriendly` is used in all catch branches, temp-file cleanup is in `finally` blocks, and the typing indicator is stopped in every exit path. Security-sensitive operations (`pdftotext`, `python3 -c`, archive extraction) use `Bun.$\`...\`` tagged templates with distinct argument slots rather than shell string concatenation — the most critical injection surface is correctly handled.

That said, there are genuine bugs and a few meaningful gaps documented below.

---

## Findings (table)

| # | File | Line(s) | Severity | Category | Title |
|---|------|---------|----------|----------|-------|
| 1 | `audio.ts` | 252 | high | UX / correctness | `releaseContainerSlot` not released on early return after rate-limit |
| 2 | `voice.ts` | 133–134 | high | UX | `stopProcessing()` called without releasing locks on transcript failure |
| 3 | `video.ts` | 161–168 | high | UX | Early return on transcript failure bypasses `finally` cleanup |
| 4 | `document.ts` | 718–720 | medium | Correctness | `MAX_FILE_SIZE` (500 MB) check fires before Telegram's own 20 MB limit is checked; dead code path |
| 5 | `document.ts` | 157 | medium | Cross-user collision | Sanitized filename not namespaced — two users uploading same filename collide in `inboxDirFor` |
| 6 | `audio.ts` | 237–238 | medium | Correctness | Extension sanitization falls back to `"bin"` extension, not the original extension; Whisper may reject unknown extensions |
| 7 | `photo.ts` | 195–207 | medium | Rate limit gap | Rate limit check only runs for single photos, not for media-group photos after the first |
| 8 | `text.ts` | 383–391 | medium | Resource leak | Pending-context retry path calls `stopProcessing()`/`typing.stop()` before `return`, but `state.cleanup()` for the *original* state is deferred to the outer `finally` — harmless today but fragile |
| 9 | `media-group.ts` | 119 | medium | Correctness | Buffer key scoped by `userId:mediaGroupId` prevents cross-user collision, but if the same user sends two *different* albums concurrently the key collision is fine; however the `processGroup` setTimeout fires outside any lock — no user lock held when the album is finally processed |
| 10 | `document.ts` | 44–64 | low | Zip-bomb partial | `checkArchiveSize` for zip reads only the last line of `unzip -l` output (total row); a specially crafted zip with no summary row returns `totalSize = 0` and passes the guard |
| 11 | `utils.ts` | 196–215 | low | Typing indicator | `loop()` is fire-and-forget (not awaited); if `ctx.replyWithChatAction` throws a non-debuggable error after `stop()` is called, the next iteration is still entered because `running` is set to `false` asynchronously |
| 12 | `utils.ts` | 233–250 | low | Error swallowing | `replyFriendly` itself does not handle the case where `ctx.reply(...)` throws — if Telegram API is down, the error is silently dropped after `console.error` |
| 13 | `text.ts` | 43 | low | Intent filter FP | `numericMultiplicity` regex matches inside words (e.g., "варианты" in "два варианта") — legitimate sequential single-item requests can get the orchestration hint injected unintentionally |
| 14 | `document.ts` | 599–625 | low | Silent drop | `processDocumentPaths` silently swallows per-file extraction errors; if all files fail, it sends "Failed to extract any documents" via raw `ctx.reply` (not `replyFriendly`) |
| 15 | `audio.ts` | 65–70 | low | Language inconsistency | Transcription-unavailable message in `processAudioFile` is in English; all other user-facing messages in handlers are in Russian |

---

## Detailed findings

### Finding 1 — high: `releaseContainerSlot` not released after rate-limit rejection in `audio.ts`

**File:** `src/handlers/audio.ts`, lines 219–228

When the rate limit check fails (line 219–228), the function calls `releaseContainerSlot?.()` and `releaseUserLock?.()`, which is correct. However, if `acquireContainerSlot()` on line 215 already completed and `releaseContainerSlot` is set, then control reaches the rate-limit branch at line 219 *with a held slot*. The `releaseContainerSlot?.()` call on line 221 fires before `return`, so the slot *is* released — but only if `releaseContainerSlot` was already assigned. There is a one-instruction window between `acquireContainerSlot()` returning (setting `releaseContainerSlot`) and the rate-limit check where an asynchronous exception would not run the cleanup. More concretely: if anything between line 215 and 221 throws synchronously, the container slot leaks permanently.

Suggested fix: wrap the entire sequence from `acquireUserLock` through `processAudioFile` in a single `try/finally` that releases both locks unconditionally (same pattern as `handleDocument`).

---

### Finding 2 — high: `stopProcessing()` called without releasing user lock on early return in `voice.ts`

**File:** `src/handlers/voice.ts`, lines 133–135

When transcription returns null (line 127), the code edits the status message and calls `stopProcessing()` on line 133, then returns. At this point the outer `finally` block (line 183) *does* run — that is correct because the function is unwinding via `return`, not a thrown exception. The `finally` block releases `releaseContainerSlot` and `releaseUserLock`. So the locks are released. However, there is a subtle ordering problem: the `return` at line 134 exits the `try` block, which triggers `finally` — meaning `stopProcessing()` is called *twice* (once explicitly on line 133, once in `finally` via `stopProcessing()` if present). Checking the `finally` block: it calls `stopProcessing()` on line 185. If `stopProcessing` is not idempotent this is a double-call bug.

Suggested fix: remove the explicit `stopProcessing()` call at line 133 and rely solely on the `finally` block; or confirm `stopProcessing` is idempotent and document it.

---

### Finding 3 — high: Early return in `video.ts` bypasses lock release temporarily

**File:** `src/handlers/video.ts`, lines 161–168

When `transcribeVoice` returns null (line 161), the code edits the message and calls bare `return` on line 168. Since this `return` is inside the outer `try` block, the `finally` on line 216 *does* execute — so locks are eventually released. However, `stopProcessing` is called in `finally`, not before the `return`. This means the session is marked as "running" for any other incoming messages during the edit-and-return window (negligible time), which is acceptable. The real problem is the structural inconsistency with `voice.ts` where the explicit `stopProcessing()` call exists at line 133 but not in `video.ts` line 168. More seriously: if the `editMessageText` call on lines 163–167 throws, the exception propagates to the outer `catch`, which calls `replyFriendly` — but also tries to access `session.consumeInterruptFlag()` which may be in an unexpected state.

Suggested fix: consolidate all early exits to use `throw` instead of `return` so the outer `catch` handles error cases uniformly.

---

### Finding 4 — medium: Dead code path in `document.ts` file-size checks

**File:** `src/handlers/document.ts`, lines 717–729

The first check on line 718 rejects files `> MAX_FILE_SIZE` (500 MB). The second check on line 722 rejects files `> TG_API_LIMIT` (20 MB). Since 20 MB < 500 MB, the first check never fires — the 500 MB rejection message is dead code. Any file over 20 MB will be caught by the second check first.

```
if (doc.file_size && doc.file_size > MAX_FILE_SIZE) { // Never reached
```

The first check should either be removed or the `MAX_FILE_SIZE` value changed to match the actual Telegram limit (20 MB).

---

### Finding 5 — medium: Cross-user filename collision in `downloadDocument`

**File:** `src/handlers/document.ts`, lines 155–157

```typescript
const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
const docPath = `${inboxDirFor(userId)}/${safeName}`;
```

`inboxDirFor(userId)` is per-user, so this is safe in the happy case. However, if two users upload a file with the same sanitized name and `inboxDirFor` returns the same directory for both (e.g., a shared `/tmp/telegram-bot` for non-container users), the second write overwrites the first. The photo handler avoids this by appending a timestamp and random suffix. The document handler does not.

If `inboxDirFor` always returns a per-user path (including for non-container owner), this is not a real collision — but the code does not make this invariant visible. Worth checking `inboxDirFor` and, if there is any shared path, adding a timestamp suffix.

---

### Finding 6 — medium: Extension sanitization in `audio.ts` falls back to `"bin"`

**File:** `src/handlers/audio.ts`, lines 237–238

```typescript
const rawExt = (audio.file_name?.split(".").pop() || "mp3").toLowerCase();
const ext = ALLOWED_AUDIO_EXTENSIONS.has(rawExt) ? rawExt : "bin";
audioPath = `${TEMP_DIR}/audio_${timestamp}.${ext}`;
```

If a user sends an audio file with a valid audio MIME type but an unrecognized extension (e.g., `.m4b`, `.caf`), the file is saved as `.bin`. `transcribeVoice` then passes this `.bin` file to OpenAI Whisper, which determines format by file extension. Whisper will likely reject it with a 400 error (unsupported file type), producing a confusing failure. The fallback should be a valid container format (`.mp3` or `.ogg`), or the MIME type should be used to derive the extension.

---

### Finding 7 — medium: Rate limit not checked for media-group photos after the first

**File:** `src/handlers/photo.ts`, lines 194–208; `src/handlers/media-group.ts`, lines 120–128

Rate limiting runs only once per album (on the first photo). All subsequent photos in the group are added without a rate-limit check. This is intentional for UX (one check per album) but means a user can add up to 10 photos in one album without additional rate-limit gates. For the current token-bucket design this is acceptable, but the implicit assumption (album = 1 request) should be documented.

Separately: the media group timeout fires on a bare `setTimeout` with no lock held. The `processCallback` is invoked from a timer callback — at that point the per-user lock from `handlePhoto` has already been released (the `finally` block in `handlePhoto` releases it when `addToGroup` returns). This means an album can be processed concurrently with a new incoming message from the same user, breaking the single-request-per-user invariant.

---

### Finding 8 — medium: Pending-context retry path fragility in `text.ts`

**File:** `src/handlers/text.ts`, lines 360–391

When a pending-context message is processed, `stopProcessing()` and `typing.stop()` are called on lines 366–367, then new processing state is created and the function returns at line 391. The outer `finally` block (line 438) then runs and calls `stopProcessing()` and `typing.stop()` a second time on an already-stopped state. If `stopProcessing` or `typing.stop()` are not idempotent, this is a double-call bug. Additionally, the pending-context catch block (line 385) uses bare `console.error` instead of `replyFriendly`, so the user gets no feedback if their queued message fails.

---

### Finding 9 — medium: Media group processed outside user lock

**File:** `src/handlers/media-group.ts`, lines 141–146

```typescript
timeout: setTimeout(
  () => processGroup(key, processCallback),
  MEDIA_GROUP_TIMEOUT
)
```

The `processGroup` callback fires from a timer. At that point, the user lock acquired in `handlePhoto` / `handleDocument` has been released. A new message arriving during the 1-second buffer window can acquire the lock and start processing concurrently with the album that fires when the timeout expires. This creates a race where two calls to `session.sendMessageStreaming` for the same user overlap.

---

### Finding 10 — low: Zip-bomb guard can be bypassed by malformed zip listing

**File:** `src/handlers/document.ts`, lines 44–50

```typescript
const lastLine = lines[lines.length - 1]!.trim();
const match = lastLine.match(/^(\d+)/);
if (match) totalSize = parseInt(match[1]!, 10);
```

`unzip -l` produces a summary line like `  12345  3 files`. If the archive is crafted without a summary line (some non-standard zips) or `unzip` outputs a different format (e.g., locale-dependent), `match` will be null and `totalSize` stays at 0. The guard then passes without error (`if (totalSize > MAX_UNCOMPRESSED_SIZE)`). The post-extraction `assertNoZipSlip` and `MAX_ARCHIVE_CONTENT` limit still constrain damage, but the size gate itself is bypassable.

---

### Finding 11 — low: Typing indicator loop races with `stop()`

**File:** `src/utils.ts`, lines 196–215

The `loop()` async function runs concurrently. `stop()` sets `running = false`. However, if `loop()` is currently awaiting `ctx.replyWithChatAction` (which takes up to a few seconds on a slow connection) when `stop()` is called, the `while (running)` check only fires after the current `await` resolves. This means the typing indicator continues firing for up to one `replyWithChatAction` call's duration after `stop()`. This is cosmetically undesirable but not a correctness issue. The existing design accepts this tradeoff.

---

### Finding 12 — low: `replyFriendly` silently drops errors from `ctx.reply`

**File:** `src/utils.ts`, lines 233–250

```typescript
await ctx.reply(`❌ ${friendly}`);
```

If the Telegram API is unavailable, this `await` throws, and the exception propagates to the caller's `catch` block (where `replyFriendly` was called). Depending on the caller, this may produce an unhandled error or a double-logged error. Wrapping the `ctx.reply` in its own `try/catch` with a `console.error` fallback would make this function fully safe to call from any `catch` block.

---

### Finding 13 — low: Orchestration hint injection false positives in `text.ts`

**File:** `src/handlers/text.ts`, lines 43–46

The `numericMultiplicity` regex uses `\b` word boundaries but the word list includes inflected Russian words like `вариант[аов]?`. Russian `\b` boundaries are unreliable in JS regex for Cyrillic — `\b` works only at ASCII word boundaries. A message like "два варианта" will match, but so will a message like "рассмотри два варианта последовательно" — the `sequential` suppression guard at line 36 would fire for that, so it works. However, a message like "один из нескольких вариантов" would not match the sequential suppression but also not match the numeric rule, while "3 варианта" will match and inject orchestration context even for trivially small tasks.

This is a design tradeoff, not a security issue. The current false positive rate may be acceptable.

---

### Finding 14 — low: Silent extraction failure swallowed in `processDocumentPaths`

**File:** `src/handlers/document.ts`, lines 614–616

```typescript
} catch (error) {
  console.error(`Failed to extract ${path}:`, error);
}
```

Per-file extraction errors are silently logged. If *all* files fail, line 620 sends:

```typescript
await ctx.reply("❌ Failed to extract any documents.");
```

This is a raw `ctx.reply` not routed through `replyFriendly`, so the error is not written to the audit log via `auditLogError`. Consistent use of `replyFriendly` here would also improve audit coverage.

---

### Finding 15 — low: English user-facing message in `processAudioFile`

**File:** `src/handlers/audio.ts`, line 66–68

```typescript
await ctx.reply(
  "Voice transcription is not configured. Set OPENAI_API_KEY in .env"
);
```

All other user-facing messages are in Russian. This leaks an implementation detail (env var name) to users. The message should be localized and the env var reference removed.

---

## What is in order

- `replyFriendly` is consistently used in all primary `catch` blocks across all six handlers — no raw `ctx.reply("❌ Error: " + e)` pattern found.
- Temp-file cleanup (`unlinkSync`) is always in `finally` blocks in `voice.ts`, `audio.ts`, and `video.ts`.
- `pdftotext`, `python3 -c`, `unzip`, and `tar` are all invoked via `Bun.$\`...\`` with separately interpolated arguments — no shell string concatenation. Command injection through Telegram-provided filenames is not possible via these paths.
- `downloadDocument` sanitizes the filename with `/[^a-zA-Z0-9._-]/g` before using it in a path — special characters including path separators are stripped.
- Archive extraction has layered defenses: size pre-check, tar path-traversal pre-scan, and post-extraction `assertNoZipSlip` walk.
- `wrapAsFileData` in `document.ts` wraps file content with explicit "данные, не инструкции" framing to reduce prompt injection surface from untrusted file content.
- Buffer key in `media-group.ts` is `${userId}:${mediaGroupId}` — cross-user album collision is prevented.
- `userId` is consistently derived from `ctx.from?.id` at handler entry and threaded through all downstream calls including `checkInterrupt`, `getSession`, and `auditLog`.
- `mediaHint: true` is correctly set only in `photo.ts` / `processImageDocument`; all text-derived handlers (voice, audio, video) explicitly pass `false`.

---

## Architectural remarks

**Lock-vs-timer gap (Findings 7, 9):** The media group pattern inherently releases the per-user lock before the album fires. The correct fix is to acquire a fresh user lock inside `processGroup` before calling the callback. This requires passing `acquireUserLock`/`releaseUserLock` into the media-group module or restructuring to hold the lock for the timer's duration.

**Pending-context processing (Finding 8):** The pending-context retry is inlined inside the main `try` block in `text.ts`. Extracting it into a helper function that mirrors the full handler flow (lock, state, streaming, audit, finally) would eliminate the double-cleanup and the silent-catch issue.

**Audio size limit (Finding 6):** OpenAI Whisper's 25 MB input limit is never enforced before calling `transcribeVoice`. A file between 20 MB and 25 MB can pass Telegram's download gate and the current size checks in `handleAudio`, then fail inside Whisper. The error is caught by `transcribeVoice`'s internal `try/catch` which returns `null`, producing a generic "transcription failed" message with no indication of the cause.
