import { describe, it, expect, vi, beforeEach } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@/lib/runtime/secureStorage', () => ({
  secureGet: vi.fn(async (k: string) => mem.get(k) ?? null),
  secureSet: vi.fn(async (k: string, v: string) => {
    mem.set(k, v);
  }),
  secureRemove: vi.fn(async (k: string) => {
    mem.delete(k);
  }),
}));

const state: { user: { id: string } | null } = { user: { id: 'u1' } };
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => state },
}));

import { isPushOptedOut, setPushOptedOut } from '@/lib/runtime/pushPreference';

describe('pushPreference (PUSH-OPTOUT-01)', () => {
  beforeEach(() => {
    mem.clear();
    state.user = { id: 'u1' };
  });

  it('defaults to not opted out', async () => {
    expect(await isPushOptedOut()).toBe(false);
  });

  it('persists the opt-out and can clear it', async () => {
    await setPushOptedOut(true);
    expect(await isPushOptedOut()).toBe(true);
    await setPushOptedOut(false);
    expect(await isPushOptedOut()).toBe(false);
  });

  it('is scoped per user on a shared device', async () => {
    await setPushOptedOut(true);
    state.user = { id: 'u2' };
    expect(await isPushOptedOut()).toBe(false);
  });

  it('is a no-op when nobody is signed in', async () => {
    state.user = null;
    await setPushOptedOut(true);
    expect(mem.size).toBe(0);
    expect(await isPushOptedOut()).toBe(false);
  });
});
