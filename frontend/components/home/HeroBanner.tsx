import Link from 'next/link';
import { Button }    from '@/components/shared/ui/Button';
import { SearchBar } from '@/components/layout/SearchBar';
import { ROUTES }    from '@/lib/constants';

/**
 * FIX UX-01: previously a generic light-tint gradient
 * (bg-gradient-to-b from-primary/5 to-transparent) with a plain
 * centered h1 — the exact pattern every unstyled shadcn hero defaults
 * to, with no relationship to what makes this specific marketplace
 * distinct from a template. Replaced with the brand olive as a solid
 * field (not a fade), and the headline stays "سوق غزة" as the eyebrow
 * while the actual message — the local, person-to-person promise this
 * product exists for — carries the hero as the real headline.
 */
export function HeroBanner() {
  return (
    <section className="relative overflow-hidden bg-primary px-4 py-14 text-primary-foreground sm:py-20">
      {/* Subtle repeating diagonal pattern — a woven/textile texture
          reference kept quiet enough not to compete with the copy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, currentColor 0, currentColor 1px, transparent 1px, transparent 14px)',
        }}
      />

      <div className="relative mx-auto max-w-2xl space-y-6 text-center">
        <span className="inline-block rounded-full border border-primary-foreground/30 px-3 py-1 text-xs font-medium tracking-wide text-primary-foreground/90">
          سوق غزة
        </span>

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          من أهل غزة، لأهل غزة
        </h1>
        <p className="text-base text-primary-foreground/85 sm:text-lg">
          سيارات، عقارات، إلكترونيات وأكثر — بيع واشترِ من جيرانك، بثقة.
        </p>

        <SearchBar className="mx-auto max-w-xl [&_input]:bg-primary-foreground [&_input]:text-foreground" />

        <div className="pt-1">
          <Button asChild size="lg" variant="secondary" className="font-semibold">
            <Link href={ROUTES.adCreate}>نشر إعلان مجاناً</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
