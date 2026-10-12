import { ROUTES } from '@/lib/constants';

const AUTH_ONLY_PATHS = new Set([
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  '/verify-email',
]);

/**
 * Build a same-origin login URL after a session ends in another tab.
 * Preserve the page and its query string when doing so helps the user,
 * but never set an auth page as the post-login destination (that can
 * create a confusing login-to-login loop).
 */
export function buildSessionExpiredLoginUrl(pathname: string, search = ''): string {
  const safePath =
    pathname.startsWith('/') &&
    !pathname.startsWith('//') &&
    !pathname.includes('\\') &&
    !pathname.includes('\r') &&
    !pathname.includes('\n')
      ? pathname
      : ROUTES.dashboard;

  const normalizedSearch = search.startsWith('?') ? search : search ? `?${search}` : '';
  const isAuthPage = AUTH_ONLY_PATHS.has(safePath);

  if (isAuthPage) {
    return `${ROUTES.login}?reason=session_expired`;
  }

  const from = encodeURIComponent(`${safePath}${normalizedSearch}`);
  return `${ROUTES.login}?from=${from}&reason=session_expired`;
}
