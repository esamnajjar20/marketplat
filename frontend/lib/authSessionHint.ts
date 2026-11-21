/**
 * AUTH-ANON-REFRESH-01: decide whether the initial /auth/refresh call can be skipped.
 *
 * The refresh token lives in an httpOnly cookie that JS cannot read, so
 * AuthHydrationProvider used to call /auth/refresh on every page load. For a
 * visitor who never logged in that request always returns 401, which shows up as
 * a "Browser errors logged to console" failure in Lighthouse and costs one wasted
 * round-trip.
 *
 * IMPORTANT: the backend's `app_has_session` cookie is httpOnly (authCookies.ts,
 * setSessionHintCookie), so `document.cookie` can NEVER contain it. Only the
 * middleware can see it. The middleware therefore mirrors it into the
 * JS-readable `app_session_hint` cookie (see SESSION_HINT_MIRROR_COOKIE), and that
 * mirror is what the client checks. The mirror is written on the document response
 * itself, so it is already present in document.cookie when client JS first runs.
 *
 * Skip the refresh only when there is:
 *   - no session hint (mirror or, if a deployment ever makes it readable, original),
 *   - no `app_access_token` cookie,
 *   - and no persisted user in the auth store.
 *
 * This is deliberately conservative: any signal of a possible session, and every
 * non-browser / native-app context, still performs the refresh exactly as before.
 */
export const SESSION_HINT_MIRROR_COOKIE = 'app_session_hint';

export function hasCookie(cookieString: string, name: string): boolean {
  return cookieString
    .split(';')
    .some((part) => {
      const trimmed = part.trim();
      return trimmed.startsWith(`${name}=`) && trimmed.length > name.length + 1;
    });
}

export function shouldSkipAnonymousRefresh(opts: {
  cookieString: string;
  hasPersistedUser: boolean;
  isNative: boolean;
}): boolean {
  if (opts.isNative) return false;
  if (opts.hasPersistedUser) return false;
  if (hasCookie(opts.cookieString, SESSION_HINT_MIRROR_COOKIE)) return false;
  if (hasCookie(opts.cookieString, 'app_has_session')) return false;
  if (hasCookie(opts.cookieString, 'app_access_token')) return false;
  return true;
}
