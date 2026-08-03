import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';

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
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/*
        Design pass: added the same quiet woven-texture overlay used on
        the home hero (HeroBanner) and the /search brand strip — this
        panel used a flat bg-primary fill with nothing tying it back to
        that identity beyond the color itself.
      */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, currentColor 0, currentColor 1px, transparent 1px, transparent 14px)',
          }}
        />
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
      <div className="flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/*
            Design pass: on mobile/tablet the branding panel above is
            fully hidden (lg:flex only) — previously the only trace of
            it there was a bare logo with no color at all, so the
            majority of visitors (phone-sized screens) never saw the
            brand identity this panel carries. A slim primary-colored
            strip (same woven texture, compressed) now stands in for
            it below `lg`, echoing /search's own "brand band" treatment
            rather than leaving mobile with a plain white card and no
            identity signal at all.
          */}
          <div className="relative -mx-8 -mt-8 mb-8 overflow-hidden bg-primary px-8 py-6 lg:hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, currentColor 0, currentColor 1px, transparent 1px, transparent 14px)',
              }}
            />
            <Link href="/" className="relative flex justify-center">
              <Logo variant="light" />
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
