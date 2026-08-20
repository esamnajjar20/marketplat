import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { WovenTexture } from '@/components/shared/ui/WovenTexture';
import { PageTransition } from '@/components/shared/PageTransition';

/**
 * (auth) route group layout.
 * Minimal chrome — logo only, no main nav or footer.
 * Middleware redirects already-authenticated users away from this group.
 *
 * FIX UX-01: the branding panel's quote was hardcoded in English on an
 * otherwise fully Arabic/RTL site ("The trusted place to buy and
 * sell..."). Replaced with Arabic copy specific to the product's actual
 * value proposition — a local Gaza marketplace, not a generic "buy and
 * sell" placeholder — and the panel now uses the brand olive rather
 * than shadcn's stock primary blue.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // FIX UI-REVIEW-DESKTOP: breakpoint dropped from lg (1024px) to md
    // (768px). Reported bug: on an actual desktop browser window
    // (not full-screen — chrome/toolbar/zoom easily bring the viewport
    // below 1024px), this grid never split — the branding panel stayed
    // hidden and the form rendered in its narrow mobile layout,
    // anchored to the top of a mostly-empty page. md is still well
    // above phone-width (max ~480px) and matches every other
    // desktop/mobile split already used elsewhere in this app (header,
    // BottomNav, CategoryGrid all switch at md, not lg) — lg was the
    // outlier specific to this layout.
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/*
        Design pass: added the same quiet woven-texture overlay used on
        the home hero (HeroBanner) and the /search brand strip — this
        panel used a flat bg-primary fill with nothing tying it back to
        that identity beyond the color itself.
      */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground md:flex">
        <WovenTexture opacity={0.07} />
        <Link href="/" className="relative">
          <Logo variant="light" />
        </Link>
        <blockquote className="relative space-y-3">
          <p className="text-2xl font-semibold leading-relaxed">
            من أهل غزة، لأهل غزة
          </p>
          <p className="text-primary-foreground/80">
            سوق محلي موثوق لبيع وشراء كل ما تحتاجه — سيارات، عقارات،
            إلكترونيات وأكثر، في حيّك ومدينتك.
          </p>
        </blockquote>
      </div>
      {/* Form panel */}
      {/* BUG FIX: `justify-center` used to vertically center the whole
          panel unconditionally, leaving a large empty gap above the
          "سوق غزة" logo strip on shorter content / taller screens on
          mobile. Fixed by anchoring to the top on mobile
          (justify-start + pt-12) — see git history for that fix's
          full reasoning.

          FIX UI-REVIEW-DESKTOP: that mobile-motivated justify-start
          was applying unconditionally, including on md+ where the
          branding panel is a full-height flex column and there's no
          risk of a short-content gap — the form card just sat pinned
          near the top with a large dead area below it instead of
          sitting at the panel's natural visual center the way a
          split-screen auth layout normally does. Re-centers at md+
          only, where the two-column split is actually active. */}
      <div className="flex flex-col items-center justify-start p-8 pt-12 md:justify-center md:pt-8">
        <div className="w-full max-w-sm">
          {/*
            Design pass: on mobile/tablet the branding panel above is
            fully hidden (md:flex only) — previously the only trace of
            it there was a bare logo with no color at all, so the
            majority of visitors (phone-sized screens) never saw the
            brand identity this panel carries. A slim primary-colored
            strip (same woven texture, compressed) now stands in for
            it below `md`, echoing /search's own "brand band" treatment
            rather than leaving mobile with a plain white card and no
            identity signal at all.
          */}
          <div className="relative -mx-8 -mt-8 mb-8 overflow-hidden bg-primary px-8 py-6 md:hidden">
            <WovenTexture opacity={0.07} />
            <Link href="/" className="relative flex justify-center">
              <Logo variant="light" />
            </Link>
          </div>
          <PageTransition>{children}</PageTransition>
        </div>
      </div>
    </div>
  );
}
