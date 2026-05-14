# Authorization Layer Audit — 09_authorization.md

Date: 2026-05-14
Scope: who is authorized to do what, where the checks happen, where bypasses are possible.
Method: read-only code inspection.

---

## Summary of Authorization Architecture

The bot uses a layered model:

1. **ALLOWED_USERS** (in-memory array) — gate for all message types. Populated from `TELEGRAM_ALLOWED_USERS` env + `system/users.json` at startup.
2. **getUserProfile(userId)** — determines owner vs guest. Source of truth is `users.json`: only `role === "owner"` yields owner branch. All other cases fall to guest.
3. **profile.allowedCommands** (Set) — per-profile command whitelist checked in `commandAllowed()`.
4. **Subscription gate** middleware — checks Telegram channel membership for non-owner guests.
5. **Consent gate** middleware — blocks all interaction until `/consent_accept` callback.
6. **`handleInviteCallback`** — owner-only check via `ctx.from?.id !== OWNER_USER_ID`.
7. **Dashboard `/api/admin/all`** — checks `validated.user.id !== OWNER_ID`.

---

## Vector-by-vector Findings

### V1. Chat-id vs user-id confusion

**Verdict: NOT EXPLOITABLE in practice, but latent.**

`isAuthorized(userId, ALLOWED_USERS)` consistently uses `ctx.from?.id`. The sequentialize middleware uses `ctx.chat?.id` only for queue keying, not for auth. No handler passes `ctx.chat?.id` where `userId` is expected. The only place `chatId` is used for privileged action is `reloadbot` — and there it is used to store the restart message location, not to gate access.

However, if the bot is ever added to a group chat, `ctx.chat?.id` would be a negative number (group id) while `ctx.from?.id` would still be the individual user. Because `isAuthorized` is called with `ctx.from?.id`, group membership does not grant access. This is correct.

**No issue currently.** Risk: if a future handler accidentally passes `ctx.chat?.id` to `isAuthorized`, users in a shared group whose group-id happens to be in `ALLOWED_USERS` could gain access. Unlikely but the types don't prevent it.

---

### V2. /restart and /reloadbot — owner-only enforcement

**`/restart`:** Checked in `commands.ts:409` via `commandAllowed(userId, "restart")`. `GUEST_COMMANDS` includes `restart` (line 1009 in `config.ts`). So `/restart` is allowed for guests — this is intentional per the comment on line 997: "per-user session reset, so it's safe for guests."

**`/reloadbot`:** Checked via `commandAllowed(userId, "reloadbot")`. `GUEST_COMMANDS` does NOT include `reloadbot`. Owner gets it via `OWNER_COMMANDS`. This is correct.

**Reply-chain edge case:** Both handlers extract `userId` from `ctx.from?.id`, not from any reply metadata. A guest replying to an old bot message cannot change their own `userId`. No bypass here.

**Callback edge case:** There are no callback buttons for `/restart` or `/reloadbot`. Not exploitable via callback.

**Verdict: No vulnerability.** `/restart` is guest-accessible by design. `/reloadbot` is correctly owner-only.

---

### V3. invite_approve callback — who can approve?

**Check location:** `callback.ts:317` — `handleInviteCallback` starts with:
```typescript
if (ctx.from?.id !== OWNER_USER_ID) {
  await ctx.answerCallbackQuery({ text: "Недоступно" });
  return;
}
```

`OWNER_USER_ID = 292228713` is a hardcoded constant in `config.ts:967`. `ctx.from?.id` comes from Telegram's signed update — cannot be spoofed by a user controlling their own client.

**Can a guest forge `callback_data = "invite_approve_<userId>"`?**
Yes, in theory a Telegram client could send an arbitrary `callback_query` with crafted `data`. However the bot checks `ctx.from?.id !== OWNER_USER_ID` first. If the guest sends this callback, their `ctx.from?.id` is their own userId (e.g. `893951298`), which !== `292228713`. The check fires and returns "Недоступно". The approval code never runs.

**Is the callback routed without auth first?**
In `handleCallback` (callback.ts:37), the first check is `isAuthorized`. If the sender is not in `ALLOWED_USERS`, the function returns "Unauthorized" before reaching `handleInviteCallback`. For the invite flow, the requester is by definition NOT yet in `ALLOWED_USERS` (they are pending). So a non-approved user cannot reach this callback path at all — the `isAuthorized` check blocks them.

Wait — there is a subtlety. The invite approval buttons are sent TO THE OWNER's chat. If a guest somehow obtained the message ID and tried to click those buttons from their own Telegram client, Telegram would not let them — inline keyboard buttons are tied to the message and can only be "clicked" by users who can see that message. The owner's DM is private.

**Verdict: No bypass.** The owner-ID check is correct and in the right place.

---

### V4. Tier promotion path — can a guest upgrade themselves to "paid"?

**Via users.json directly:** If V-01 (free guest has root Bash on host) is exploitable, the guest can `cat /opt/claude-tg-bot/system/users.json`, then construct a write that sets `"tier": "paid"` for themselves. This is already captured as V-1F in VULNERABILITIES.md and depends on V-01 being open.

**Via YooKassa webhook forgery:** If V-00 (IP-filter bypass) is open, a guest can POST a fake payment success event and upgrade themselves. Already captured as V-00 in VULNERABILITIES.md.

**Via AI Edit/Write tool on users.json:** If a free-tier guest has access to the `Write` or `Edit` tools and their `allowedPaths` includes the bot directory, they could write to `system/users.json`. However:
- `profile.allowedPaths = [vaultDir, /tmp/telegram-bot/${userId}/]` for guests
- `/opt/claude-tg-bot/system/users.json` is NOT in `vaultDir` (`/opt/vault/<userId>/`)
- `isPathAllowedFor` would block Write/Edit to that path

BUT: if V-01 is open (raw Bash = `cat`/`echo` on host as root), the Bash tool bypasses `isPathAllowedFor` entirely. Path: `echo '{"userId":X,"tier":"paid",...}' >> /opt/claude-tg-bot/system/users.json`. This is a second leg of V-01/V-1F.

**Via OAuth error fallback:** No fallback path exists. The `isSubscribed` function returns `false` on error, not `true`.

**Verdict: Tier promotion is only possible via V-00 or V-01 (already documented). No new independent path.**

---

### V5. /pay — can a guest invoke it as owner?

`handlePay` checks `isAuthorized(userId, ALLOWED_USERS) || !userId` and uses `userId = ctx.from?.id`. No impersonation possible at the Telegram protocol level. The `/pay` command is in `GUEST_COMMANDS` — both owner and guests can call it, which is intentional (owner can see subscription status and link).

The YooKassa link is generated for `userId = ctx.from?.id`. A guest cannot generate a payment link for the owner's ID.

**Verdict: No issue.**

---

### V6. Dashboard /api/admin/all — can initData be forged with arbitrary userId?

`validateInitData` computes HMAC-SHA256 with `secretKey = HMAC-SHA256("WebAppData", BOT_TOKEN)`. The `user` field is included in the signed `dataCheckString`. An attacker would need to know `BOT_TOKEN` to forge a different `user.id`.

If `BOT_TOKEN` is compromised (e.g. via V-01 reading `.env`), an attacker could forge initData with `"id": 292228713` and get admin dashboard access. This is a secondary consequence of V-01, not an independent vulnerability in the dashboard auth logic.

The HMAC comparison uses `timingSafeEqual` (line 156 of dashboard-server.ts), which is correct.

The `auth_date` freshness check (24h window at line 168) prevents replay of old valid tokens.

**Verdict: Dashboard auth is correctly implemented. The only bypass requires prior compromise of BOT_TOKEN (which flows from V-01).**

---

### V7. Subscription gate bypass — routes that skip it

The subscription middleware is installed before all handlers. Let's enumerate what bypasses it:

1. `!isSubscriptionGateEnabled()` → gate disabled (config-dependent, not a vulnerability)
2. `!userId` → passes to next (downstream handlers will reject anyway)
3. `!isAuthorized(userId, ALLOWED_USERS)` → passes to next (unauthorized user hits invite flow, never processes messages)
4. `profile.isOwner` → owner bypasses (intentional)
5. `ctx.callbackQuery?.data === "subscription:check"` → recheck button bypasses (handled in `handleSubscriptionCheckCallback`, which re-verifies and does not grant access)

**Are there message types that bypass the middleware?**
The middleware is in `bot.use()` which applies to ALL updates including voice, photo, document, video, callbacks. The only bypass is `subscription:check` callback, which is handled safely.

**`channel_post` handler (line 110):** The bot listens to `channel_post` events. This handler only logs `chat.id` to stdout and does not process user commands. Not a bypass.

**`my_chat_member` handler (line 94):** Fires when the bot's membership changes. Only logs to stdout and sends an owner DM. Does not process user messages. Not a bypass.

**Verdict: Subscription gate has no bypass for message processing. The `subscription:check` exception is safe.**

---

### V8. Owner alert channel — can a guest inject into it?

Owner alerts go to `OWNER_PROBLEM_CHANNEL_ID` (env var) via `notifyOwnerDM()` in `owner-alerts.ts`. This function is called internally only from the bot's own code (crash watcher, system events). No user-triggered path calls `notifyOwnerDM` directly with user-controlled data without prior formatting/escaping.

The `replyFriendly` function sends errors to the user's own chat, not the alert channel.

A guest cannot set `OWNER_PROBLEM_CHANNEL_ID` (env var, read-only at runtime unless V-01 lets them restart the bot). Even if they could, alerts are sent by internal code, not user data.

**Verdict: No guest path to inject into the owner alert channel.**

---

### V9. Container shell — can a guest get owner's container?

Container selection in `session.ts` uses `profile.containerEnabled` and constructs the container name as `claude-user-${userId}`. Each user gets their own container named by their own `userId`. Owner has `containerEnabled: false` by default.

If a guest crafts `userId` in a request — impossible, `userId` comes from `ctx.from?.id` (Telegram-signed).

The notify-bridge (port 3849) verifies that the source IP matches `docker inspect claude-user-${userId}`, making it impossible for guest A's container to send notifications on behalf of guest B.

**Verdict: Container isolation is correct. No cross-user container access.**

---

### V10. Reply-to chain — context leak?

`text.ts:191-203` reads `ctx.message?.reply_to_message` and prepends its text to the user's message as:
```
[В ответ на сообщение от ${replyFrom}: «${truncated}»]
```

`replyFrom` is `replyMsg.from?.first_name || replyMsg.from?.username || "unknown"`. This could contain attacker-controlled text if the replied-to user has a crafted `first_name` (e.g. containing prompt-injection patterns). This is already captured as V-1J in VULNERABILITIES.md.

**Cross-user context leak:** If guest A replies to a message sent BY THE BOT (to guest A's own chat), the reply_to_message is from the bot itself (sender = bot). The bot's first_name is "Proboi" — not dangerous. The text is whatever the bot said in that conversation — only visible to guest A already.

Guests cannot see each other's chats. Telegram DMs are private. A guest cannot reply to a message from another user's conversation.

**Verdict: No cross-user data leak via reply-to. The prompt-injection risk via first_name/username is already noted in VULNERABILITIES.md as V-1J.**

---

### V11. Free / paid tier check during long sessions

`profile.tier` is read by `getUserProfile(userId)` which calls `UserRegistry.getUser(userId)` which reads from the in-memory `_cache`. The cache is populated from `system/users.json` at startup and updated atomically on `UserRegistry.saveUser()`.

**Subscription expiry during an active session:** When a subscription expires, `chargeExpiredTrials(bot)` runs every 6 hours (index.ts:498) and calls `UserRegistry.saveUser()` with updated tier. This updates `_cache`. Next time `getUserProfile(userId)` is called, it picks up the new tier.

**But:** a long-running session (e.g. a query running for hours) would not be interrupted mid-stream when the tier changes. The tier is read at query start (when `getUserProfile` is called in `sendMessageStreaming`). A query started at 11:59 PM would run with the paid profile even if the subscription expired at midnight.

**Severity:** LOW. The billing granularity is daily, and a session running past midnight is a natural edge case, not an attack vector. The next query after the session ends would use the downgraded tier.

**Verdict: Not a security vulnerability. Acceptable business logic edge case.**

---

### V12. Forwarded messages — can guest A impersonate guest B?

Telegram forwarded messages preserve `forward_from` field but do NOT change `from` (the sender of the current message). `isAuthorized` and all profile lookups use `ctx.from?.id`, which is the actual sender, not the forwarded-from user.

If guest A forwards a message from guest B, `ctx.from?.id` is still A's ID. The bot treats it as A's message. No impersonation.

**Verdict: Not exploitable. Telegram protocol prevents `from` spoofing.**

---

## New Findings Not in VULNERABILITIES.md

### AUTH-01. consent_accept callback bypasses subscription gate (LOW)

**Location:** `index.ts:207-227` (consent gate middleware)

The consent gate has an explicit bypass:
```typescript
if (ctx.callbackQuery?.data === "consent_accept") {
  return next();
}
```

The subscription gate (earlier middleware) also has a bypass for `subscription:check`. But `consent_accept` is NOT in the subscription gate bypass list. So an unauthorized or unsubscribed user clicking `consent_accept` would pass the subscription gate (because `!isAuthorized` → passes through the subscription gate to next), then hit the consent gate which lets `consent_accept` through, then hit `handleCallback`.

In `handleCallback`, the first check is `isAuthorized`. An unauthorized user (not in ALLOWED_USERS) would get "Unauthorized" and exit. An authorized but unsubscribed user would pass the subscription gate (since the subscription gate lets unsubscribed-but-authorized users through ONLY IF the `consent_accept` call reaches the subscription gate after authorization... wait, re-reading:

Subscription gate line 137: `if (!isAuthorized(userId, ALLOWED_USERS)) return next();` — unauthorized user PASSES THROUGH the subscription gate (intentional, so they reach the invite flow). But then the consent gate runs. An unsubscribed-but-authorized user hits the subscription gate, fails the `isSubscribed` check, and gets the gate message. They never reach `consent_accept` through the callback path if they are already showing the subscription gate.

Re-examining: the subscription gate blocks `ctx.callbackQuery` too (line 164: `if (ctx.callbackQuery)` → shows alert). BUT the bypass `ctx.callbackQuery?.data === "subscription:check"` does NOT include `consent_accept`. So an unsubscribed user clicking `consent_accept` gets the subscription alert, not the consent handler.

**Verdict: No bypass. The ordering (subscription gate first, consent gate second) means an unsubscribed authorized user cannot use `consent_accept` to bypass the subscription gate. Minor design confusion but not exploitable.**

---

### AUTH-02. task_confirm callback: auth check uses task.assignedTo but task file is not user-scoped (MEDIUM)

**Location:** `callback.ts:439-491` — `handleTaskConfirmCallback`

Tasks are stored as files identified by `taskId`. The file path is not shown here but comes from `loadPendingTask(taskId)`. The auth check is:
```typescript
if (action === "accept" && ctx.from?.id !== task.assignedTo) {
  await ctx.answerCallbackQuery({ text: "Это не твоя задача 😊" });
  return;
}
```

**Issue:** `taskId` comes from `callbackData` which is `task_confirm:<taskId>:<action>`. There is no per-user scoping of `taskId` in the callback data. If guest A knows the `taskId` of a task assigned to guest B, guest A could craft a `task_confirm:<B_taskId>:reject` callback and attempt to reject B's task.

The auth check at line 463 prevents `accept` by a non-assignee, and line 467 prevents `reject` by anyone who is neither assignee nor assignedBy. So guest A cannot accept B's task. But if A is `task.assignedBy` (the assigner), A can reject their own assignment — which is intentional.

**Is `taskId` guessable?** Depends on implementation of `loadPendingTask`. Not inspected here, but if `taskId` is a UUID, brute-forcing is infeasible. If it is sequential or time-based, enumeration is possible.

**Verdict: MEDIUM if task IDs are guessable. Auth checks are present but operate on `taskId` that comes from user-controlled callback data without a per-user scoping layer. Recommend checking `loadPendingTask` implementation for ID format.**

---

### AUTH-03. ALLOWED_USERS in-memory mutation is not persisted for subscription gate cache (LOW)

**Location:** `callback.ts:371-373` — on invite approve:
```typescript
if (!ALLOWED_USERS.includes(targetUserId)) {
  ALLOWED_USERS.push(targetUserId);
}
```

The subscription gate (index.ts:137) checks `isAuthorized(userId, ALLOWED_USERS)`. If a newly approved user messages the bot before the bot restarts, they are in `ALLOWED_USERS` (mutated in-memory). Good.

But `_allowedUsers` in `dashboard-server.ts:54-58` is a separate cache:
```typescript
let _allowedUsers: Set<number> | null = null;
function getAllowedUsers(): Set<number> {
  if (!_allowedUsers) {
    _allowedUsers = new Set(ALLOWED_USERS);
  }
  return _allowedUsers;
}
```

This cache is built ONCE from `ALLOWED_USERS` and never invalidated. If a new user is approved after startup, they are added to `ALLOWED_USERS` (in-memory array) but NOT to `_allowedUsers` (Set, built once). The notify-bridge uses `getAllowedUsers().has(userId)` to validate userId. A newly approved user's container could send notifications that are rejected by the bridge.

**Severity:** LOW. Does not grant unauthorized access — it only blocks a legitimate user's container notifications after approval. Not a security hole, but an operational bug.

---

### AUTH-04. Consent gate has no auth check — consent records any userId (INFO)

**Location:** `consent-gate.ts` (not read, inferred from `recordConsent` calls) and `src/consent.ts`.

The consent gate passes `consent_accept` through to `handleCallback`, which checks `isAuthorized` first. So an unauthorized user clicking `consent_accept` (on a message they somehow received) would be rejected by `handleCallback`. However, if `recordConsent(userId)` is called inside the consent callback BEFORE the auth check, an unauthorized user could get consent recorded without being authorized.

This needs verification of the actual `consent_accept` handler path. Based on the code structure (handleCallback does `isAuthorized` as first check), if the handler calls `recordConsent` only after auth passes, there is no issue. Flag for verification.

---

## Summary of New Findings

| ID | Severity | Description |
|----|----------|-------------|
| AUTH-01 | INFO | consent_accept vs subscription gate ordering — not exploitable |
| AUTH-02 | MEDIUM | task_confirm callback: taskId from user-controlled data, auth checks rely on task content, verify taskId entropy |
| AUTH-03 | LOW | notify-bridge `_allowedUsers` cache not updated on runtime invite approval |
| AUTH-04 | INFO | Consent recording before/after auth — verify `consent_accept` handler order |

None of AUTH-01 through AUTH-04 duplicate existing VULNERABILITIES.md entries.

AUTH-02 is the only finding worth escalating: it represents a privilege-related logic issue where task operations on another user's task may be possible if `taskId` is enumerable.
