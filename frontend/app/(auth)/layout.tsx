import { PublicHeader } from '@/components/layout/PublicHeader';
import { PageTransition } from '@/components/shared/PageTransition';

/**
 * (auth) route group layout.
 * Middleware redirects already-authenticated users away from this group,
 * so PublicHeader's guest branch (تسجيل الدخول/إنشاء حساب buttons) is the
 * only one ever actually reachable here in practice.
 *
 * DESIGN-PASS AUTH-01: replaced the previous split-screen layout (brand
 * panel + form panel side-by-side on md+) with a centered single-column
 * layout — one wide soft card floating on the page background, no side
 * panel. Matches the reference design's structure (centered card, glow
 * accents behind it) while keeping this app's own tokens/fonts/routes:
 * bg-primary/5 and bg-accent/5 stand in for the reference's arbitrary
 * hex blur colors (there is no "vibrant-emerald" token here — --accent,
 * the brand terracotta, is this app's second brand color and reads
 * correctly at 5% opacity the same way), and the reference's Facebook
 * button is dropped from GoogleAuthButton's callers (LoginForm/
 * RegisterForm) since this app has no Facebook OAuth route to link it to.
 *
 * DESIGN-PASS AUTH-02: added PublicHeader (the same header every other
 * public page uses — logo, nav, auth buttons) above the card, matching
 * the reference design's full header — this group previously ran with
 * "Minimal chrome — logo only" deliberately, but the reference design
 * explicitly includes the full site header, so this now reuses that
 * same shared component (not a rebuilt copy) so header changes stay
 * in one place. The previous standalone logo Link above the card is
 * dropped, since the header already carries the logo.
 *
 * UX-FIX: showSearch={false} — reported that a full search bar on
 * login/register/forgot-password/reset-password made no sense (a
 * visitor here isn't browsing listings). Everything else about the
 * shared header (logo, nav, auth buttons) stays.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader showSearch={false} />
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16">
        {/* Soft glow accents behind the card — same idea as the
            reference design's two blurred circles, recolored to this
            app's own primary/accent tokens instead of its hardcoded
            hex values. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 -z-10 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[100px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 -z-10 h-[400px] w-[400px] rounded-full bg-accent/5 blur-[80px]"
        />

        {/* DESKTOP-AUDIT-02: id targeted by the root layout's SkipLink —
            this group has no <main> (single-column card layout), so the
            id goes on the content wrapper instead. */}
        <div id="main-content" className="w-full max-w-md">
          <PageTransition>{children}</PageTransition>
        </div>
      </div>
    </div>
  );
}
