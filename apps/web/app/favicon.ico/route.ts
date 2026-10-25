import { NextResponse } from 'next/server';

/**
 * FIX FAVICON-404-01: browsers always probe /favicon.ico regardless of the
 * <link rel="icon"> tags, and the app only ships app/icon.* (served at /icon…),
 * so DevTools logged "Failed to load resource: 404 (favicon.ico)" on every load.
 * Redirect that legacy probe to the existing generated icon route.
 */
export function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/icon-192', request.url), 308);
  response.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  return response;
}
