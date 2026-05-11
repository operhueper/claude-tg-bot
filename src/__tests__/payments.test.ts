/**
 * Unit tests for payment utilities in src/payments.ts.
 *
 * UserRegistry.getUser / UserRegistry.saveUser are mocked in-memory so tests
 * never touch the filesystem.  alertNewSubscriber is also mocked to avoid
 * hitting the network.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';

// ---------------------------------------------------------------------------
// In-memory UserRegistry mock (replaces the real disk-backed implementation)
// ---------------------------------------------------------------------------

type UserNode = {
  userId: number;
  role: 'owner' | 'guest' | 'new_guest';
  label: string;
  timezone: string;
  settingSources: string[];
  rateLimitEnabled: boolean;
  model: string;
  tier?: 'free' | 'paid';
  subscription_expires?: string;
  payment_method_id?: string;
  trial_used?: boolean;
  trial_activated_at?: string;
  grace_period_until?: string;
};

const store = new Map<number, UserNode>();

function makeGuest(userId: number): UserNode {
  return {
    userId,
    role: 'guest',
    label: 'TestUser',
    timezone: 'Europe/Moscow',
    settingSources: ['project'],
    rateLimitEnabled: false,
    model: 'deepseek',
    tier: 'free',
  };
}

// Patch UserRegistry before importing the module under test.
mock.module('../user-registry.js', () => ({
  UserRegistry: {
    getUser(userId: number): UserNode | null {
      return store.get(userId) ?? null;
    },
    saveUser(node: UserNode): void {
      store.set(node.userId, { ...node });
    },
    getAllUsers(): UserNode[] {
      return [...store.values()];
    },
    reload(): void {
      // no-op in tests
    },
  },
}));

// Stub out the alerts module so tests don't send HTTP requests.
mock.module('../alerts.js', () => ({
  alertNewSubscriber: async () => {},
}));

// ---------------------------------------------------------------------------
// Now import the module under test (after mocks are registered).
// ---------------------------------------------------------------------------

const {
  getUserSubscriptionExpiry,
  isTrialUsed,
  activateSubscription,
  markTrialUsed,
  downgradeToFree,
  SUBSCRIPTION_DAYS,
} = await import('../payments.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TEST_USER_ID = 99999;

beforeEach(() => {
  store.clear();
  store.set(TEST_USER_ID, makeGuest(TEST_USER_ID));
});

describe('getUserSubscriptionExpiry', () => {
  test('returns null for user without subscription', () => {
    const result = getUserSubscriptionExpiry(TEST_USER_ID);
    expect(result).toBeNull();
  });

  test('returns null for unknown user', () => {
    const result = getUserSubscriptionExpiry(888888);
    expect(result).toBeNull();
  });

  test('returns a Date when subscription_expires is set', async () => {
    await activateSubscription(TEST_USER_ID, 30);
    const result = getUserSubscriptionExpiry(TEST_USER_ID);
    expect(result).toBeInstanceOf(Date);
  });
});

describe('isTrialUsed', () => {
  test('returns false for new user without trial_used flag', () => {
    expect(isTrialUsed(TEST_USER_ID)).toBe(false);
  });

  test('returns false for unknown user', () => {
    expect(isTrialUsed(888888)).toBe(false);
  });
});

describe('activateSubscription', () => {
  test('sets tier to paid', async () => {
    await activateSubscription(TEST_USER_ID, SUBSCRIPTION_DAYS);
    const user = store.get(TEST_USER_ID)!;
    expect(user.tier).toBe('paid');
  });

  test('sets subscription_expires roughly SUBSCRIPTION_DAYS days from now', async () => {
    const before = Date.now();
    await activateSubscription(TEST_USER_ID, SUBSCRIPTION_DAYS);
    const after = Date.now();

    const user = store.get(TEST_USER_ID)!;
    expect(user.subscription_expires).toBeDefined();
    const expiry = new Date(user.subscription_expires!).getTime();

    const minExpiry = before + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000;
    const maxExpiry = after + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000;
    expect(expiry).toBeGreaterThanOrEqual(minExpiry);
    expect(expiry).toBeLessThanOrEqual(maxExpiry);
  });

  test('extends from current expiry when already paid', async () => {
    // Activate once for 30 days.
    await activateSubscription(TEST_USER_ID, 30);
    const firstExpiry = new Date(store.get(TEST_USER_ID)!.subscription_expires!).getTime();

    // Activate again for another 30 days — should stack on top.
    await activateSubscription(TEST_USER_ID, 30);
    const secondExpiry = new Date(store.get(TEST_USER_ID)!.subscription_expires!).getTime();

    const expected = firstExpiry + 30 * 24 * 60 * 60 * 1000;
    // Allow 100ms tolerance for execution time.
    expect(Math.abs(secondExpiry - expected)).toBeLessThan(100);
  });
});

describe('markTrialUsed', () => {
  test('sets trial_used to true', () => {
    markTrialUsed(TEST_USER_ID);
    expect(store.get(TEST_USER_ID)!.trial_used).toBe(true);
  });

  test('sets trial_activated_at to a valid ISO timestamp', () => {
    const before = new Date().toISOString();
    markTrialUsed(TEST_USER_ID);
    const ts = store.get(TEST_USER_ID)!.trial_activated_at!;
    expect(ts).toBeDefined();
    expect(new Date(ts).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  test('isTrialUsed returns true after markTrialUsed', () => {
    markTrialUsed(TEST_USER_ID);
    expect(isTrialUsed(TEST_USER_ID)).toBe(true);
  });
});

describe('downgradeToFree', () => {
  test('clears tier back to free', async () => {
    await activateSubscription(TEST_USER_ID, 30);
    expect(store.get(TEST_USER_ID)!.tier).toBe('paid');

    downgradeToFree(TEST_USER_ID);
    expect(store.get(TEST_USER_ID)!.tier).toBe('free');
  });

  test('clears subscription_expires', async () => {
    await activateSubscription(TEST_USER_ID, 30);
    downgradeToFree(TEST_USER_ID);
    expect(store.get(TEST_USER_ID)!.subscription_expires).toBeUndefined();
  });

  test('clears payment_method_id', () => {
    const user = store.get(TEST_USER_ID)!;
    store.set(TEST_USER_ID, { ...user, payment_method_id: 'pm_test_123' });
    downgradeToFree(TEST_USER_ID);
    expect(store.get(TEST_USER_ID)!.payment_method_id).toBeUndefined();
  });
});
