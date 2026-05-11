# Testing Checklist — Proboi Bot (Task 11)

Test server: **@ORCH7_bot** (jinru, 5.223.82.96)
Test date: 2026-05-11

---

## Scenario 1 — New user onboarding

**Steps:**
1. Open @ORCH7_bot for the first time (or clear history).
2. Send `/start`.

**Expected:**
- Welcome message is sent.
- A "📖 Открыть гайд" (or equivalent guide) button appears in the message.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 2 — Daily limit reached (free user)

**Steps:**
1. Log in as a free-tier user.
2. Send 10 text messages (any content).
3. Send the 11th text message.

**Expected:**
- On the 11th message: a paywall/limit message appears.
- The message contains a `/pay` button or link.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 3 — 80% daily limit warning

**Steps:**
1. Log in as a free-tier user with 0 messages used today.
2. Send 8 text messages.

**Expected:**
- On the 8th message the bot appends a warning: "осталось 2 из 10" (or equivalent phrasing).

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 4 — Free photo (no gate)

**Steps:**
1. Log in as a free-tier user.
2. Send a photo (any image, with or without caption).

**Expected:**
- Bot responds with image analysis.
- No paywall or gate message appears.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 5 — First free document

**Steps:**
1. Log in as a free-tier user whose `freeDocUsed` flag is unset.
2. Send a PDF document.

**Expected:**
- Bot responds with document analysis.
- After the response an upsell/upgrade message is shown (e.g., "хочешь без ограничений — /pay").

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 6 — Second document (paywall)

**Steps:**
1. Continue from Scenario 5 (or manually set `freeDocUsed=true` for the user).
2. Send a second PDF document.

**Expected:**
- Bot replies with a paywall message instead of processing the document.
- Message contains a link to the guide (e.g., `proboi.site/how-to-setup`) or `/pay`.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 7 — Trial activation via /pay (no prior trial)

**Steps:**
1. Log in as a free-tier user where `trial_used` is false.
2. Send `/pay`.

**Expected:**
- Bot sends a message with a YuKassa binding link button ("Привязать карту — 5 дней бесплатно").
- A second button "Что даёт Профи →" pointing to `proboi.site/how-to-setup` is present.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 8 — /pay after trial already used

**Steps:**
1. Log in as a free-tier user where `trial_used = true`.
2. Send `/pay`.

**Expected:**
- Bot sends a direct payment link for 499 ₽/месяц (no trial offer).
- YuKassa link is present as a button.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 9 — /status as paid user

**Steps:**
1. Log in as a user with an active paid subscription.
2. Send `/status`.

**Expected:**
- Status message shows the subscription expiry date.
- A "Отменить подписку" (or /cancel) button is present.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 10 — /cancel as free user

**Steps:**
1. Log in as a free-tier user.
2. Send `/cancel`.

**Expected:**
- Bot replies: "нет активной подписки" (or equivalent).

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 11 — /cancel as paid user (full flow)

**Steps:**
1. Log in as a paid user.
2. Send `/cancel`.
3. In the confirmation dialog, tap "Да, отменить" (confirm).

**Expected:**
- After confirmation the bot replies: "Подписка отменена до [date]" (or equivalent).
- User tier is downgraded to free.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 12 — /info command

**Steps:**
1. Send `/info`.

**Expected:**
- Bot replies with the tier/feature comparison.
- The first button is the guide link ("📖 Открыть гайд" or similar).

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 13 — Dashboard guide button

**Steps:**
1. Open the Mini App dashboard (via the button in `/status` or any entry point).

**Expected:**
- Dashboard page loads.
- A "📖 Открыть гайд" button is visible.

**Status:** [ ] PASS  [ ] FAIL
**Notes:**

---

## Scenario 14 — GET /oferta

**Steps:**
1. Run: `curl https://proboi.site/oferta`
   (or locally: `curl http://localhost:3848/oferta`)

**Expected:**
- HTTP 200.
- Response body is an HTML page containing оферта text.

**Status:** [x] PASS  [ ] FAIL
**Notes:** Verified against test server — HTTP 200, HTML page returned.

---

## Scenario 15 — GET /privacy

**Steps:**
1. Run: `curl https://proboi.site/privacy`
   (or locally: `curl http://localhost:3848/privacy`)

**Expected:**
- HTTP 200.
- Response body is an HTML privacy policy page.

**Status:** [x] PASS  [ ] FAIL
**Notes:** Verified against test server — HTTP 200, HTML page returned.

---

## Scenario 16 — GET /how-to-setup

**Steps:**
1. Run: `curl https://proboi.site/how-to-setup`
   (or locally: `curl http://localhost:3848/how-to-setup`)

**Expected:**
- HTTP 200.
- Page loads with multiple sections (guide content).

**Status:** [x] PASS  [ ] FAIL
**Notes:** Verified against test server — HTTP 200, HTML with 27 heading/section elements returned.

---

## Scenario 17 — YuKassa webhook

**Steps:**
1. Run:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"type":"payment.succeeded","event":"test","object":{"id":"test","status":"succeeded","amount":{"value":"1.00","currency":"RUB"},"created_at":"2026-05-11"}}' \
     http://localhost:3848/webhook/yukassa
   ```

**Expected:**
- HTTP 200 OK.
- No 500 or 4xx error (missing userId in metadata is silently skipped).

**Status:** [x] PASS  [ ] FAIL
**Notes:** Verified against test server — HTTP 200 returned.

---

## Scenario 18 — GET /subscribe?status=success

**Steps:**
1. Run: `curl "http://localhost:3848/subscribe?status=success"`

**Expected:**
- HTTP 200.
- HTML page with success message ("Карта привязана") and a link back to the bot.

**Status:** [x] PASS  [ ] FAIL
**Notes:** Verified against test server — page title "Карта привязана! — Proboi" confirmed.

---

## Scenario 19 — GET /subscribe?status=cancel

**Steps:**
1. Run: `curl "http://localhost:3848/subscribe?status=cancel"`

**Expected:**
- HTTP 200.
- HTML cancel/retry page.

**Status:** [x] PASS  [ ] FAIL
**Notes:** Verified against test server — HTTP 200, HTML page returned.

---

## Automated Test Results

```
bun test v1.3.13 (bf2e2cec)

 30 pass
 0 fail
 38 expect() calls
Ran 30 tests across 2 files. [198.00ms]
```

Tests run:
- `src/__tests__/payments.test.ts` — 15 tests covering getUserSubscriptionExpiry, isTrialUsed, activateSubscription, markTrialUsed, downgradeToFree
- `src/__tests__/daily-limit.test.ts` — 15 tests covering isDailyLimitReached, getDailyUsage, getTodayCount, hasFreeDocUsed, markFreeDocUsed

## Manual Testing Notes

Test server: @ORCH7_bot (jinru, 5.223.82.96)
Test date: 2026-05-11
