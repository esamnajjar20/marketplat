'use client';

import { Button } from '@/components/shared/ui/Button';
import { API_BASE_URL } from '@/lib/constants';

/**
 * FIX OAUTH-01 — "Continue with Google" button.
 *
 * Deliberately a plain <a>-style full-page navigation
 * (window.location.href), NOT an onClick handler calling axios/fetch:
 * GET /auth/google (see backend's auth.routes.ts) must be a top-level
 * browser navigation so the browser itself follows Google's redirect
 * chain and carries the resulting Set-Cookie response headers on the
 * final /auth/google/callback redirect back into this app — an XHR/
 * fetch call cannot do this (CORS blocks cross-origin redirects to
 * accounts.google.com from being followed transparently the way a
 * real navigation does, and even if it could, the response body
 * would arrive as inert data with no browser navigation attached).
 *
 * After the round trip, the browser lands back on this app's own
 * origin with the session cookies already set by the backend's
 * googleCallback handler — the existing AuthHydrationProvider
 * (mounted globally, see providers/AppProviders.tsx) then picks up
 * the new session automatically via its normal /auth/refresh call,
 * exactly as it does after a normal full-page reload. No new
 * frontend auth-state wiring was needed for this to work.
 *
 * Hidden entirely (renders null) unless
 * NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED is set at build time — mirrors the
 * existing pattern in components/pwa/PushNotificationToggle.tsx for
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY: a build-time env flag that tracks
 * whether the *backend* has real Google OAuth credentials configured
 * (see backend's config/env.ts googleOAuth.isConfigured), so the
 * button never appears in a deployment where clicking it would just
 * hit the backend's 503 GOOGLE_OAUTH_NOT_CONFIGURED response.
 */

interface GoogleAuthButtonProps {
  /** Shown on the button itself, e.g. "تسجيل الدخول" vs "إنشاء حساب". */
  label?: string;
}

export function GoogleAuthButton({ label = 'المتابعة باستخدام Google' }: GoogleAuthButtonProps) {
  if (!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2"
      onClick={() => {
        window.location.href = `${API_BASE_URL}/auth/google`;
      }}
    >
      <GoogleIcon />
      {label}
    </Button>
  );
}

/** Standard 4-color Google "G" mark. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.88 2.69-6.64z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.996 8.996 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
