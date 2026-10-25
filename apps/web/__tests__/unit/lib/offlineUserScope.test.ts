import { describe, expect, it, beforeEach } from 'vitest';
import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';

describe('offlineUserScope', () => {
  beforeEach(() => localStorage.clear());

  it('reads the persisted authenticated user id', () => {
    localStorage.setItem('marketplace-auth', JSON.stringify({ state: { user: { id: 'user-a' } } }));
    expect(getCurrentOfflineUserId()).toBe('user-a');
  });

  it('fails closed for malformed or signed-out state', () => {
    expect(getCurrentOfflineUserId()).toBeNull();
    localStorage.setItem('marketplace-auth', '{bad');
    expect(getCurrentOfflineUserId()).toBeNull();
  });
});
