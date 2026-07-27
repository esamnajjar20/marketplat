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
      {/* Branding panel — hidden on mobile */}
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <Link href="/">
          <Logo variant="light" />
        </Link>
        <blockquote className="space-y-3">
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
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/">
              <Logo />
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
