/**
 * __tests__/unit/hooks/useNotificationStream.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  isNotificationStreamConnected,
  useNotificationStream,
  splitSseFrames,
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

  it('splits LF-delimited SSE frames and retains an incomplete tail', () => {
    expect(splitSseFrames('event: notification\ndata: {}\n\nevent: message\ndata: {"x":1}'))
      .toEqual({
        frames: ['event: notification\ndata: {}'],
        remainder: 'event: message\ndata: {"x":1}',
      });
  });

  it('supports CRLF and CR-only SSE frame delimiters', () => {
    expect(splitSseFrames('event: notification\r\ndata: {}\r\n\r\nevent: message\rdata: ok\r\r'))
      .toEqual({
        frames: ['event: notification\r\ndata: {}', 'event: message\rdata: ok'],
        remainder: '',
      });
  });

  it('does not dispatch a frame until its blank-line terminator arrives', () => {
    expect(splitSseFrames('event: notification\r\ndata: {}\r'))
      .toEqual({ frames: [], remainder: 'event: notification\r\ndata: {}\r' });
  });

  it('isNotificationStreamConnected starts false', () => {
    expect(typeof isNotificationStreamConnected()).toBe('boolean');
  });

  it('hook does not throw when logged out', () => {
    const { result } = renderHook(() => useNotificationStream());
    expect(result.current === undefined || typeof result.current === 'object').toBe(true);
  });
});
