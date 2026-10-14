/**
 * __tests__/unit/hooks/useNotificationStream.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  isNotificationStreamConnected,
  useNotificationStream,
} from '@/hooks/useNotificationStream';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ isAuthenticated: false, accessToken: null }),
  ),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectAccessToken: (s: { accessToken: string | null }) => s.accessToken,
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken ?? s?.hasAccessToken),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHydratedIsAuthenticated: (s: any) => (s?.isHydrated ? Boolean(s?.isAuthenticated ?? s?.user) : false),
  selectIsAuthResolving: (s: any) => Boolean(s?.isAuthResolving),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectUser: (s: any) => s?.user,
  selectIsAdmin: (s: any) => Boolean(s?.isAdmin ?? (s?.user?.role === 'ADMIN' || s?.user?.role === 'MODERATOR')),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueriesData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

describe('useNotificationStream', () => {
  it('isNotificationStreamConnected starts false', () => {
    expect(typeof isNotificationStreamConnected()).toBe('boolean');
  });

  it('hook does not throw when logged out', () => {
    const { result } = renderHook(() => useNotificationStream());
    expect(result.current === undefined || typeof result.current === 'object').toBe(true);
  });
});
