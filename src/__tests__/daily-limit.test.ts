/**
 * Unit tests for daily-limit.ts.
 *
 * All logic is in-memory (Maps), so no mocking is needed.
 * We reset state between tests by clearing the Maps via resetIfNewDay / a
 * fresh userId per test to avoid inter-test pollution.
 */

import { describe, test, expect } from 'bun:test';

import {
  isDailyLimitReached,
  getDailyUsage,
  incrementDailyUsage,
  hasFreeDocUsed,
  markFreeDocUsed,
  getTodayCount,
  resetIfNewDay,
} from '../daily-limit.js';

// Use a unique base ID per test group so tests never share state.
// (The module caches data in module-level Maps; different IDs = different slots.)
const BASE_ID = 70000;
let idCounter = 0;
function newId(): number {
  return BASE_ID + idCounter++;
}

// ---------------------------------------------------------------------------
// isDailyLimitReached
// ---------------------------------------------------------------------------

describe('isDailyLimitReached', () => {
  test('returns false for a brand-new user (no messages yet)', () => {
    const uid = newId();
    expect(isDailyLimitReached(uid, 10)).toBe(false);
  });

  test('returns false when count is below the limit', () => {
    const uid = newId();
    for (let i = 0; i < 9; i++) incrementDailyUsage(uid);
    expect(isDailyLimitReached(uid, 10)).toBe(false);
  });

  test('returns true when count equals the limit', () => {
    const uid = newId();
    const limit = 10;
    for (let i = 0; i < limit; i++) incrementDailyUsage(uid);
    expect(isDailyLimitReached(uid, limit)).toBe(true);
  });

  test('returns true when count exceeds the limit', () => {
    const uid = newId();
    const limit = 10;
    for (let i = 0; i <= limit; i++) incrementDailyUsage(uid);
    expect(isDailyLimitReached(uid, limit)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getDailyUsage
// ---------------------------------------------------------------------------

describe('getDailyUsage', () => {
  test('returns used=0 and remaining=limit for a fresh user', () => {
    const uid = newId();
    const { used, limit, remaining } = getDailyUsage(uid, 10);
    expect(used).toBe(0);
    expect(limit).toBe(10);
    expect(remaining).toBe(10);
  });

  test('used reflects the number of increments', () => {
    const uid = newId();
    incrementDailyUsage(uid);
    incrementDailyUsage(uid);
    incrementDailyUsage(uid);
    const { used, limit, remaining } = getDailyUsage(uid, 10);
    expect(used).toBe(3);
    expect(remaining).toBe(limit - 3);
  });

  test('remaining does not go below 0', () => {
    const uid = newId();
    const limit = 10;
    for (let i = 0; i < limit + 5; i++) incrementDailyUsage(uid);
    const { remaining } = getDailyUsage(uid, limit);
    expect(remaining).toBe(0);
  });

  test('limit reflects whatever TierConfig.dailyMessageLimit is passed', () => {
    const uid = newId();
    const { limit } = getDailyUsage(uid, 10);
    expect(limit).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getTodayCount and resetIfNewDay
// ---------------------------------------------------------------------------

describe('getTodayCount', () => {
  test('returns 0 for an unseen user', () => {
    expect(getTodayCount(newId())).toBe(0);
  });

  test('increments correctly', () => {
    const uid = newId();
    incrementDailyUsage(uid);
    incrementDailyUsage(uid);
    expect(getTodayCount(uid)).toBe(2);
  });
});

describe('resetIfNewDay', () => {
  test('does not reset counter when called on the same day', () => {
    const uid = newId();
    incrementDailyUsage(uid);
    resetIfNewDay(uid);
    expect(getTodayCount(uid)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// hasFreeDocUsed / markFreeDocUsed
// ---------------------------------------------------------------------------

describe('hasFreeDocUsed', () => {
  test('returns false for a new user', () => {
    expect(hasFreeDocUsed(newId())).toBe(false);
  });

  test('returns false before markFreeDocUsed is called', () => {
    const uid = newId();
    expect(hasFreeDocUsed(uid)).toBe(false);
  });

  test('returns true after markFreeDocUsed is called', () => {
    const uid = newId();
    markFreeDocUsed(uid);
    expect(hasFreeDocUsed(uid)).toBe(true);
  });

  test('stays true after multiple marks', () => {
    const uid = newId();
    markFreeDocUsed(uid);
    markFreeDocUsed(uid);
    expect(hasFreeDocUsed(uid)).toBe(true);
  });

  test('different users have independent doc-used flags', () => {
    const uid1 = newId();
    const uid2 = newId();
    markFreeDocUsed(uid1);
    expect(hasFreeDocUsed(uid1)).toBe(true);
    expect(hasFreeDocUsed(uid2)).toBe(false);
  });
});
