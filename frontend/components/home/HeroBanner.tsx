import Link from 'next/link';
import { Button }    from '@/components/shared/ui/Button';
import { SearchBar } from '@/components/layout/SearchBar';
import { WovenTexture } from '@/components/shared/ui/WovenTexture';
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
 *
 * VISUAL (mobile top-bar redesign): on mobile the banner is now an
 * inset rounded card (radius, side margins) rather than a full-bleed
 * edge-to-edge block, and the search bar moved out of the card — it
 * lives in the header's own mobile search row instead — so the card
 * is pure brand messaging + CTA, matching the reference layout where
 * search sits in the title bar and the green card is a self-contained
 * promo panel below it. Desktop keeps the original full-bleed
 * treatment with its own search bar, since the header's search field
 * is hidden below `md`. The gradient runs primary→a slightly lighter
 * mix of primary, both derived from the same --primary token, so it
 * re-derives correctly in dark mode without a separate dark variant.
 */
export function HeroBanner() {
  return (
    <section className="relative overflow-hidden px-4 py-6 sm:bg-primary sm:py-20 sm:text-primary-foreground">
      {/* Mobile: rounded promo card, inset from the screen edges. */}
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground sm:hidden">
        <WovenTexture opacity={0.07} />
        <div className="relative space-y-3 text-right">
          <span className="inline-block rounded-full border border-primary-foreground/30 px-3 py-1 text-xs font-medium tracking-wide text-primary-foreground/90">
            سوق غزة
          </span>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">
            من أهل غزة، لأهل غزة
          </h1>
          <p className="text-sm text-primary-foreground/85">
            سيارات، عقارات، إلكترونيات وأكثر — بيع واشترِ من جيرانك، بثقة.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button asChild size="default" variant="secondary" className="font-semibold">
              <Link href={ROUTES.adCreate}>نشر إعلان مجاناً</Link>
            </Button>
            <Button
              asChild
              size="default"
              variant="ghost"
              className="font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link href={`${ROUTES.search}?type=ads`}>تصفّح الإعلانات</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop: original full-bleed treatment with its own search bar. */}
      <div className="relative mx-auto hidden max-w-2xl space-y-6 text-center sm:block">
        <WovenTexture opacity={0.07} />
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

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Button asChild size="lg" variant="secondary" className="font-semibold">
            <Link href={ROUTES.adCreate}>نشر إعلان مجاناً</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link href={`${ROUTES.search}?type=ads`}>تصفّح الإعلانات</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
