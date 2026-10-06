/**
 * __tests__/unit/store/auth.store.test.ts
 *
 * Coverage targets:
 *  - Initial state
 *  - setAuth: populates user, tokens, isAuthenticated
 *  - setAuth: normalises AuthResultUser to AuthUser shape (null avatarUrl/city)
 *  - setUser: replaces full user
 *  - merges partial without clobbering role/id
 *  - no-op when user is null
 *  - setAccessToken: updates token AND sets isAuthenticated=true ()
 *  - logout: resets all state
 *  - setHydrated: sets isHydrated flag
 *  - persist partialize: accessToken is excluded from persistence
 *  - Selectors: selectUser, selectIsAuthenticated, selectAccessToken,
 *               selectIsAdmin, selectIsHydrated,
 *               selectSetAuth, selectSetUser, selectPatchUser, selectLogout
 *
 * refreshToken removed from this store entirely — it now
 * lives exclusively in an httpOnly cookie the backend sets directly
 * (see backend-v9's shared/utils/authCookies.ts), never in Zustand/
 * localStorage. Every refreshToken-specific test below (selector,
 * persistence, setAccessToken's second argument) was removed rather
 * than adapted, since there is no longer any such value in this store
 * to test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { AuthResultUser, AuthTokens } from '@/types/auth.types';
import {
  selectUser,
  selectIsAuthenticated,
  selectAccessToken,
  selectIsAdmin,
  selectIsAdminTier,
  selectIsHydrated,
  selectSetAuth,
  selectSetUser,
  selectPatchUser,
  selectLogout,
} from '@/store/auth.store';

// ── Test ─────────────────────────────────────────────────

const mockAuthResultUser: AuthResultUser = {
  id:    'user-123',
  name:  'Ahmed Al-Gaza',
  email: 'ahmed@example.com',
  role:  'USER',
};

const mockAdminUser: AuthResultUser = {
  id:    'admin-456',
  name:  'Admin User',
  email: 'admin@example.com',
  role:  'ADMIN',
};

// Gap #20 (admin permission tiers)
const mockModeratorUser: AuthResultUser = {
  id:    'mod-789',
  name:  'Moderator User',
  email: 'mod@example.com',
  role:  'MODERATOR',
};

const mockSuperAdminUser: AuthResultUser = {
  id:    'super-999',
  name:  'Super Admin User',
  email: 'super@example.com',
  role:  'SUPER_ADMIN',
};

const mockTokens: AuthTokens = {
  accessToken: 'access-token-abc',
};

// ── Reset store between tests ─────────────────────────────────────

beforeEach(() => {
  useAuthStore.getState().logout();
});

// ── Initial state ─────────────────────────────────────────────────

describe('initial state', () => {
  it('user is null', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('accessToken is null', () => {
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('isAuthenticated is false', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ── setAuth ───────────────────────────────────────────────────────

describe('setAuth', () => {
  it('clears stale seller/provider role hints from a previous session', () => {
    useAuthStore.getState().setLastKnownRoles({ isSeller: true, isProvider: true, hasActiveStore: true });
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(useAuthStore.getState().lastKnownRoles).toBeNull();
  });

  it('sets isAuthenticated to true', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('stores the access token', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(useAuthStore.getState().accessToken).toBe('access-token-abc');
  });

  it('maps AuthResultUser fields to AuthUser', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    const user = useAuthStore.getState().user!;
    expect(user.id).toBe('user-123');
    expect(user.name).toBe('Ahmed Al-Gaza');
    expect(user.email).toBe('ahmed@example.com');
    expect(user.role).toBe('USER');
  });

  it('sets avatarUrl to null (filled by /users/me later)', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(useAuthStore.getState().user?.avatarUrl).toBeNull();
  });

  it('sets city to null (filled by /users/me later)', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(useAuthStore.getState().user?.city).toBeNull();
  });

  it('sets ADMIN role correctly', () => {
    useAuthStore.getState().setAuth(mockAdminUser, mockTokens);
    expect(useAuthStore.getState().user?.role).toBe('ADMIN');
  });
});

// ── setUser ───────────────────────────────────────────────────────

describe('setUser', () => {
  it('replaces the full user object', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    useAuthStore.getState().setUser({
      id:        'user-123',
      name:      'Ahmed Updated',
      email:     'ahmed@example.com',
      role:      'USER',
      avatarUrl: 'https://res.cloudinary.com/demo/avatar.jpg',
      city:      'غزة',
    });
    const user = useAuthStore.getState().user!;
    expect(user.name).toBe('Ahmed Updated');
    expect(user.avatarUrl).toBe('https://res.cloudinary.com/demo/avatar.jpg');
    expect(user.city).toBe('غزة');
  });
});

// ── ─────────────────────────────────────────────────────

describe('patchUser', () => {
  it('merges partial update without clobbering existing fields', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    useAuthStore.getState().patchUser({ city: 'خان يونس' });
    const user = useAuthStore.getState().user!;
    expect(user.city).toBe('خان يونس');
    expect(user.role).toBe('USER'); // not overwritten
    expect(user.id).toBe('user-123');
  });

  it('does not change isAuthenticated', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    useAuthStore.getState().patchUser({ name: 'New Name' });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('is a no-op when user is null', () => {
    // user is null from beforeEach's logout()
    expect(() => useAuthStore.getState().patchUser({ name: 'x' })).not.toThrow();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does not overwrite role with patch', () => {
    useAuthStore.getState().setAuth(mockAdminUser, mockTokens);
    useAuthStore.getState().patchUser({ name: 'Updated Admin' });
    expect(useAuthStore.getState().user?.role).toBe('ADMIN');
  });
});

// ── setAccessToken — ─────────────────────────────────────

describe('setAccessToken (FIX C-06)', () => {
  it('updates the access token', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    useAuthStore.getState().setAccessToken('new-access');
    expect(useAuthStore.getState().accessToken).toBe('new-access');
  });

  it('CRITICAL: sets isAuthenticated=true (FIX C-06 — was false after reload)', () => {
    // Simulate state after logout (isAuthenticated=false) followed by
    // AuthHydrationProvider calling setAccessToken after successful refresh.
    // Before this did NOT set isAuthenticated=true, causing infinite
    // redirect loops in ProtectedLayout.
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    useAuthStore.getState().setAccessToken('fresh-access');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

// ── logout ────────────────────────────────────────────────────────

describe('logout', () => {
  it('resets user to null', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('resets accessToken to null', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('sets isAuthenticated to false', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('is idempotent (calling twice does not throw)', () => {
    expect(() => {
      useAuthStore.getState().logout();
      useAuthStore.getState().logout();
    }).not.toThrow();
  });
});

// ── setHydrated ───────────────────────────────────────────────────

describe('setHydrated', () => {
  it('sets isHydrated to true', () => {
    useAuthStore.getState().setHydrated(true);
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });

  it('sets isHydrated to false', () => {
    useAuthStore.getState().setHydrated(true);
    useAuthStore.getState().setHydrated(false);
    expect(useAuthStore.getState().isHydrated).toBe(false);
  });
});

// ── Selectors ─────────────────────────────────────────────────────

describe('Selectors', () => {
  it('selectUser returns the user', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(selectUser(useAuthStore.getState())).not.toBeNull();
  });

  it('selectIsAuthenticated returns isAuthenticated', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(true);
  });

  it('selectAccessToken returns accessToken', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(selectAccessToken(useAuthStore.getState())).toBe('access-token-abc');
  });

  it('selectIsAdmin is false for USER role', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(selectIsAdmin(useAuthStore.getState())).toBe(false);
  });

  it('selectIsAdmin is true for ADMIN role', () => {
    useAuthStore.getState().setAuth(mockAdminUser, mockTokens);
    expect(selectIsAdmin(useAuthStore.getState())).toBe(true);
  });

  it('selectIsAdmin is false when no user', () => {
    expect(selectIsAdmin(useAuthStore.getState())).toBe(false);
  });

  // Gap #20 (admin permission tiers): selectIsAdmin now covers ADMIN
  // OR SUPER_ADMIN — a SUPER_ADMIN account must not be locked out of
  // any screen still gated by "is this user an admin?", since the
  // backend's own requireAdmin (rank-based) treats SUPER_ADMIN as
  // able to do everything ADMIN can.
  it('selectIsAdmin is true for SUPER_ADMIN role (Gap #20)', () => {
    useAuthStore.getState().setAuth(mockSuperAdminUser, mockTokens);
    expect(selectIsAdmin(useAuthStore.getState())).toBe(true);
  });

  it('selectIsAdmin is false for MODERATOR role (Gap #20: below ADMIN rank)', () => {
    useAuthStore.getState().setAuth(mockModeratorUser, mockTokens);
    expect(selectIsAdmin(useAuthStore.getState())).toBe(false);
  });

  // Gap #20: selectIsAdminTier is the wider "any admin-tier role" check
  // — MODERATOR and above — distinct from selectIsAdmin (ADMIN+ only).
  it('selectIsAdminTier is true for MODERATOR, ADMIN, and SUPER_ADMIN', () => {
    useAuthStore.getState().setAuth(mockModeratorUser, mockTokens);
    expect(selectIsAdminTier(useAuthStore.getState())).toBe(true);

    useAuthStore.getState().setAuth(mockAdminUser, mockTokens);
    expect(selectIsAdminTier(useAuthStore.getState())).toBe(true);

    useAuthStore.getState().setAuth(mockSuperAdminUser, mockTokens);
    expect(selectIsAdminTier(useAuthStore.getState())).toBe(true);
  });

  it('selectIsAdminTier is false for USER role', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);
    expect(selectIsAdminTier(useAuthStore.getState())).toBe(false);
  });

  it('selectIsAdminTier is false when no user', () => {
    expect(selectIsAdminTier(useAuthStore.getState())).toBe(false);
  });

  it('selectIsHydrated returns isHydrated', () => {
    useAuthStore.getState().setHydrated(true);
    expect(selectIsHydrated(useAuthStore.getState())).toBe(true);
  });

  it('selectSetAuth returns a function', () => {
    expect(typeof selectSetAuth(useAuthStore.getState())).toBe('function');
  });

  it('selectSetUser returns a function', () => {
    expect(typeof selectSetUser(useAuthStore.getState())).toBe('function');
  });

  it('selectPatchUser returns a function', () => {
    expect(typeof selectPatchUser(useAuthStore.getState())).toBe('function');
  });

  it('selectLogout returns a function', () => {
    expect(typeof selectLogout(useAuthStore.getState())).toBe('function');
  });
});

// ── persist partialize: only `user` is persisted ───────────────────

describe('persist partialize (security)', () => {
  it('accessToken is NOT in the partialised state (never persisted)', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);

    // Access the partialize function via the store's persist config
    // The simplest way: check what Zustand actually serialized in localStorage.
    // In jsdom localStorage is available.
    const raw = localStorage.getItem('marketplace-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.state?.accessToken).toBeUndefined();
    }
    // If not persisted yet (async), just verify accessToken is in-memory only
    expect(useAuthStore.getState().accessToken).toBe('access-token-abc');
  });

  // the entire point of this fix — confirms refreshToken
  // genuinely never touches localStorage at all, not even transiently.
  // Guards against a future regression re-introducing it into
  // partialize() without this test catching it.
  it('refreshToken never appears in persisted state (moved to an httpOnly cookie)', () => {
    useAuthStore.getState().setAuth(mockAuthResultUser, mockTokens);

    const raw = localStorage.getItem('marketplace-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.state?.refreshToken).toBeUndefined();
    }
    // Also confirm it's not even present as an in-memory field on the
    // store — not just excluded from persistence.
    expect('refreshToken' in useAuthStore.getState()).toBe(false);
  });
});
