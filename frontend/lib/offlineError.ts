import type { ParsedError } from './errorParser';

/**
 * standardized shape for "no network, don't even
 * try" rejections. Shape chosen to match parseApiError's already-parsed
 * short-circuit (message:string + statusCode:number, not an Error
 * instance) and isNetworkLikeFailure (code:'NETWORK_ERROR' OR
 * statusCode:0), so it flows through the entire existing error
 * pipeline — mutation hooks, toast handlers, offline-draft savers —
 * with zero changes needed at those call sites.
 */
export function makeOfflineError(): ParsedError {
  return {
    message: 'لا يوجد اتصال — جاري الحفظ محليًا',
    statusCode: 0,
    code: 'NETWORK_ERROR',
  };
}

/** Convenience wrapper — hides the typeof check from call sites. */
export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
