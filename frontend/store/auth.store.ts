/**
 * Auth store — Zustand with persist middleware.
 *
 * Security model:
 *  - accessToken: stored in-memory ONLY — never touches localStorage.
 *  - refreshToken: PROD-FIX-15 — no longer stored here at all. The
 *    backend now sets it as an httpOnly cookie (see
 *    backend-v9/src/shared/utils/authCookies.ts) that browser JS
 *    cannot read, and the browser sends it automatically to
 *    /api/v1/auth/* on same-origin requests. Removing it from this
 *    store — and therefore from localStorage — closes the XSS
 *    exposure that existed as long as a 7-day-lived secret sat
 *    somewhere any injected script could read.
 *  - user: persisted so the header/nav renders immediately on reload.
 *    NOT trusted as an auth decision by itself — see
 *    AuthHydrationProvider, which always calls /auth/refresh (backed
 *    by the httpOnly cookie) to get the real, server-verified answer;
 *    the persisted `user` here is only used to avoid a blank/flashing
 *    header while that verification is in flight.
 *
 * FIX AUTH-01: accessToken is set via setAccessToken() and read by client.ts.
 * FIX T-07: setUser accepts Partial<AuthUser> so role is preserved during profile updates.
 *
 * SEC-FIX-05: Replaced `{} as Storage` SSR fallback with a no-op Storage
 *   implementation. The empty-object cast was unsafe — it bypassed TypeScript's
 *   type checking and could produce silent runtime errors (e.g. if Zustand
 *   ever called .getItem() during SSR). The no-op implementation fulfils the
 *   Storage interface contract correctly and makes the SSR path explicit.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser, AuthTokens, AuthResultUser, UserRole } from '@/types/auth.types';

/**
 * No-op Storage for the SSR context where localStorage is unavailable.
 * Zustand calls these synchronously — they must exist and return the right types.
 */
const noopStorage: Storage = {
  getItem:    ()  => null,
  setItem:    ()  => { /* noop */ },
  removeItem: ()  => { /* noop */ },
  clear:      ()  => { /* noop */ },
  key:        ()  => null,
  length: 0,
};

interface AuthStore {
  // ── State ────────────────────────────────────────────────────────
  user:             AuthUser | null;
  accessToken:      string | null;   // in-memory only — not persisted
  isAuthenticated:  boolean;
  isHydrated:       boolean;
  /**
   * FIX AUTH-04, updated for PROD-FIX-15: true from the moment
   * Zustand rehydrates until AuthHydrationProvider's async
   * refresh+/me flow settles (success or failure). Previously this
   * only turned true when a persisted refreshToken existed in
   * localStorage; now that there's no client-readable token to check
   * for, AuthHydrationProvider always attempts the restore flow (the
   * httpOnly cookie, invisible to this code, is the actual source of
   * truth for whether a session exists) — see that component's own
   * comment for the full reasoning. isAuthResolving is still what
   * ProtectedLayout/AdminLayout wait on before making a redirect
   * decision, unchanged.
   */
  isAuthResolving:  boolean;

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Called after login/register. Sets all auth state at once.
   * user is AuthResultUser from login (minimal) — avatarUrl/city
   * are filled in after a subsequent /users/me call (see AuthHydrationProvider).
   */
  setAuth:        (user: AuthResultUser, tokens: AuthTokens) => void;

  /** Update full user after /users/me resolves. */
  setUser:        (user: AuthUser) => void;

  /** Merge partial profile changes without overwriting role/id. */
  patchUser:      (patch: Partial<AuthUser>) => void;

  /** Called by client.ts interceptor after a successful token refresh. */
  setAccessToken: (token: string) => void;

  logout:         () => void;
  setHydrated:    (value: boolean) => void;
  /** FIX AUTH-04: called by AuthHydrationProvider when the restore flow settles. */
  setAuthResolved: () => void;
  /** PROD-FIX-15: called by onRehydrateStorage — always true now, since
   * whether a session exists can only be answered by actually calling
   * /auth/refresh (the httpOnly cookie is invisible here). */
  _setAuthResolving: (value: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // ── Initial state ─────────────────────────────────────────────
      user:            null,
      accessToken:     null,
      isAuthenticated: false,
      isHydrated:      false,
      // FIX AUTH-04 / PROD-FIX-15: starts false; flipped true by
      // onRehydrateStorage below unconditionally (not "only if a
      // persisted refreshToken was found" anymore — see this field's
      // own doc comment above for why that check no longer applies).
      isAuthResolving: false,

      // ── Actions ───────────────────────────────────────────────────
      setAuth: (authResultUser, tokens) =>
        set({
          user: {
            id:        authResultUser.id,
            name:      authResultUser.name,
            email:     authResultUser.email,
            role:      authResultUser.role as UserRole,
            // avatarUrl and city filled in by /users/me — null until then
            avatarUrl: null,
            city:      null,
          },
          accessToken:     tokens.accessToken,
          isAuthenticated: true,
        }),

      setUser: (user) => set({ user }),

      patchUser: (patch) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...patch } });
      },

      // FIX C-06: isAuthenticated must be set to true here.
      // AuthHydrationProvider calls setAccessToken after a successful refresh —
      // without this, isAuthenticated stays false after reload and
      // ProtectedLayout redirects every authenticated user to /login.
      //
      // PROD-FIX-15: no longer takes a refreshToken parameter — the new
      // refreshToken from a successful /auth/refresh call is now set
      // directly as an httpOnly cookie by the backend response, never
      // touching this store or any JS-readable value at all.
      setAccessToken: (token) =>
        set({ accessToken: token, isAuthenticated: true }),

      logout: () =>
        set({
          user:            null,
          accessToken:     null,
          isAuthenticated: false,
          isAuthResolving: false,
        }),

      setHydrated: (value) => set({ isHydrated: value }),
      setAuthResolved: () => set({ isAuthResolving: false }),
      _setAuthResolving: (value) => set({ isAuthResolving: value }),
    }),
    {
      name:    'marketplace-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : noopStorage,
      ),
      // FIX: accessToken is deliberately excluded — never persisted.
      // PROD-FIX-15: refreshToken removed from this list entirely — it
      // is no longer part of this store's state at all (see the store
      // interface above), so there is nothing left to exclude/persist
      // for it specifically.
      partialize: (state) => ({
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
        // PROD-FIX-15: previously this only set isAuthResolving=true
        // when a persisted refreshToken was found (skipping the restore
        // flow entirely for a genuinely logged-out user with no
        // persisted token). That check is gone along with the token
        // itself — AuthHydrationProvider now always attempts
        // /auth/refresh on load, since the httpOnly refreshToken cookie
        // (if any) is invisible to this code and the ONLY way to find
        // out whether a session exists is to actually ask the backend.
        // Always resolving to true here keeps ProtectedLayout/
        // AdminLayout showing their loading skeleton until that real
        // answer comes back, rather than only in the (now-impossible-
        // to-detect-client-side) "was persisted" case.
        state?._setAuthResolving(true);
      },
    },
  ),
);

// ── Selectors (memoised slices to reduce re-renders) ──────────────
export const selectUser            = (s: AuthStore) => s.user;
export const selectIsAuthenticated = (s: AuthStore) => s.isAuthenticated;
export const selectAccessToken     = (s: AuthStore) => s.accessToken;
export const selectIsAdmin         = (s: AuthStore) => s.user?.role === 'ADMIN';
export const selectIsHydrated      = (s: AuthStore) => s.isHydrated;
export const selectIsAuthResolving = (s: AuthStore) => s.isAuthResolving;

// PERF-05: Action selectors — let mutation hooks subscribe to only the action
// they need rather than calling useAuthStore() which subscribes to the entire
// store and re-renders on every state change (access token rotation, etc.).
// Actions are stable references (defined in the store initialiser), so these
// selectors never trigger a re-render.
export const selectSetAuth    = (s: AuthStore) => s.setAuth;
export const selectSetUser    = (s: AuthStore) => s.setUser;
export const selectPatchUser  = (s: AuthStore) => s.patchUser;
export const selectLogout     = (s: AuthStore) => s.logout;
