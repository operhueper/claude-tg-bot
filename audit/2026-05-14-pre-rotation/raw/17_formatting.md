# Audit 17 — Formatting & Message Injection

Date: 2026-05-14
Scope: `src/formatting.ts`, `src/handlers/streaming.ts`, `src/utils.ts`, `src/containers/invites.ts`, `src/handlers/callback.ts`, `src/handlers/commands.ts`

---

## Summary

`convertMarkdownToHtml` is well-structured: code blocks and inline code are extracted before `escapeHtml` and re-inserted with `escapeHtml` applied to their contents. The main text path is correctly escaped. No full HTML injection through Claude's text output.

Most `ctx.reply` calls with `parse_mode: "HTML"` use only static hardcoded strings or properly escaped values. Several specific weak spots exist.

---

## Findings

### F-01. `ask_user` question injected unescaped into plain-text reply

**Where:** `src/handlers/streaming.ts:84`

```ts
await ctx.reply(`❓ ${question}`, { reply_markup: keyboard });
```

**The call has no `parse_mode`**, so Telegram uses plain-text mode — HTML tags in `question` are harmless. However, `question` comes from Claude (written to `/tmp/ask-user-${userId}-*.json`) and is not escaped. If Telegram ever defaults to Markdown parsing for some client, or this line gets a `parse_mode` added later, the raw question content would be a vector.

**Severity: LOW** (no parse_mode, no injection today; risk from future edit)

---

### F-02. `displayName` (first_name / username) inserted unescaped into plain-text `sendMessage` to owner

**Where:** `src/containers/invites.ts:108`

```ts
await ctx.api.sendMessage(
  ownerId,
  `🔔 Новый запрос доступа\n👤 ${displayName}${usernameLine}\n🆔 ${userId}\n💬 «${firstMessage.slice(0, 100)}»`,
  { reply_markup: { inline_keyboard: [...] } }
);
```

No `parse_mode`. Telegram parses it as plain text, so `<script>` or HTML tags are rendered as literals. First message is sliced to 100 chars but not sanitized otherwise.

**Severity: LOW** (no HTML mode → no injection; note: Telegram first_name allows Unicode, emoji, and some special chars but no structural HTML attack without parse_mode)

---

### F-03. `displayName` (first_name) unescaped in `editMessageText` to owner

**Where:** `src/handlers/callback.ts:411-412`

```ts
const statusText = alreadyExisted
  ? `✅ Пользователь ${displayName} уже был одобрен ранее`
  : `✅ Пользователь ${displayName} одобрен`;
await ctx.editMessageText(statusText);
```

No `parse_mode`. Plain text, no injection risk. Same situation as F-02.

**Severity: INFORMATIONAL** (pattern is fine without parse_mode)

---

### F-04. `sendChunkedMessages` receives already-formatted HTML and slices bytes mid-tag

**Where:** `src/handlers/streaming.ts:426-444`

```ts
for (let i = 0; i < content.length; i += TELEGRAM_SAFE_LIMIT) {
  const chunk = content.slice(i, i + TELEGRAM_SAFE_LIMIT);
  await ctx.reply(chunk, { parse_mode: "HTML" });
  // on fail → ctx.reply(chunk) without parse_mode
}
```

`content` here is **already HTML-formatted** (output of `convertMarkdownToHtml`). Slicing at `TELEGRAM_SAFE_LIMIT` (character boundary) can split in the middle of a tag, e.g. `<pre>code...` → `...code</p` truncated → malformed HTML. Telegram silently ignores malformed HTML but this can cause:
- Last chunk missing closing tags → chat client may render partially
- Truncation mid-tag producing visible `<b` text in rare cases

The fallback `ctx.reply(chunk)` (no parse_mode) means raw HTML tags are shown as text to the user if the HTML attempt fails.

**Severity: LOW** (visual glitch, no security impact)

---

### F-05. `parse_mode: "Markdown"` usage — Telegram Markdown v1, not MarkdownV2

**Where:**
- `src/handlers/commands.ts:668` (`handleInfo`)
- `src/handlers/callback.ts:97`, `src/handlers/callback.ts:119` (info_tiers, info_howto callbacks)

All three use `parse_mode: "Markdown"` with static hardcoded strings containing `*bold*`. These are static strings with no user content, so no injection risk. However, Telegram Markdown v1 treats `.`, `!`, `(`, `)` etc. as reserved in some contexts and can silently fail to parse if the message contains characters like `₽` in `499₽/мес` adjacent to asterisks.

**Severity: INFORMATIONAL** (static strings only, no user content, cosmetic rendering issue possible with special chars)

---

### F-06. TG_TOKEN mask regex — range `{8,12}` may miss future tokens

**Where:** `src/utils.ts:29`

```ts
/\d{8,12}:[A-Za-z0-9_-]{35}/g,   // Telegram bot token
```

Current Telegram bot token IDs are 8–10 digits. The cap at 12 is fine today. If Telegram ever issues longer IDs (unlikely but possible), tokens would leak to audit log. The second part `{35}` is exact — Telegram tokens are exactly 35 chars after the colon, so false negatives would only come from the prefix.

False positive risk: a string like `1234567890:AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhI` (valid-looking) in user content would be masked, which is the desired behavior.

**Severity: INFORMATIONAL** (acceptable for now; note for future maintenance)

---

### F-07. No caption length validation before sending via Telegram API

**Where:** `src/handlers/streaming.ts:165-173`

```ts
await ctx.replyWithDocument(inputFile, { caption });
await ctx.replyWithVideo(inputFile, { caption });
await ctx.replyWithPhoto(inputFile, { caption });
await ctx.replyWithAudio(inputFile, { caption });
```

`caption` comes from `send-file` MCP drop-box JSON (`data.caption`). Telegram enforces a 1024-character limit for captions. If Claude writes a caption > 1024 chars, the Telegram API call throws a `Bad Request: caption is too long` error. This is caught by the outer try/catch which logs it but the file is NOT sent to the user. The JSON drop-box file is also NOT cleaned up (the `unlinkSync` at line 178 is inside the success branch).

**Effect:** file silently not delivered; drop-box file left on disk accumulating `/tmp/send-file-${userId}-*.json` entries.

**Severity: LOW** (no security impact; reliability issue — stale drop-box files)

---

### F-08. Voice/Whisper output goes directly to Claude as user message — no HTML escaping needed

**Where:** `src/handlers/voice.ts`, `src/handlers/audio.ts`

Whisper transcript is passed as plain text to `session.sendMessageStreaming`, which eventually feeds it to Claude as a user message. The result from Claude goes through `convertMarkdownToHtml` before being sent to Telegram. Any HTML in Whisper output (e.g. if the audio contains someone saying `less than sign bold greater than sign`) would be: escaped in the conversion step (since it's not in backticks/code), rendered as `&lt;b&gt;` in the chat.

**Severity: NONE** (correctly handled by the existing pipeline)

---

## Summary Table

| ID | Location | Vector | Severity | Already in VULNERABILITIES.md? |
|----|----------|--------|----------|-------------------------------|
| F-01 | streaming.ts:84 | ask_user question unescaped (no parse_mode) | LOW | No |
| F-02 | invites.ts:108 | first_name in owner notification (no parse_mode) | LOW | V-1J partial (reply_to context) |
| F-03 | callback.ts:411-412 | displayName in editMessageText (no parse_mode) | INFO | No |
| F-04 | streaming.ts:426-444 | HTML slicing mid-tag in chunked send | LOW | No |
| F-05 | commands.ts:668, callback.ts:97,119 | parse_mode Markdown v1 on static strings | INFO | No |
| F-06 | utils.ts:29 | TG_TOKEN mask range may miss future long IDs | INFO | No |
| F-07 | streaming.ts:165-173 | caption > 1024 chars → file not delivered + stale dropbox | LOW | No |
| F-08 | voice.ts, audio.ts | Whisper HTML in output | NONE | N/A |

## Main Conclusion

No HTML injection path exists through Claude's text output or user messages — `convertMarkdownToHtml` correctly escapes before applying Markdown-to-tag conversions. The `first_name` injection vectors (F-01, F-02, F-03) are neutralized by absence of `parse_mode` on those calls. The most actionable finding is F-07 (caption truncation leaving stale dropbox files). F-04 is a cosmetic rendering bug on very long responses.
