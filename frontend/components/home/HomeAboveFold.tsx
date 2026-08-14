'use client';

import { Sparkles, Clock } from 'lucide-react';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { FeaturedAds }  from '@/components/home/FeaturedAds';
import { RecentAds }    from '@/components/home/RecentAds';
import { Skeleton }     from '@/components/shared/ui/Skeleton';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useCategories } from '@/hooks/queries/useCategories';
import { useAds }       from '@/hooks/queries/useAds';
import { ROUTES }       from '@/lib/constants';
import Link from 'next/link';

/**
 * FIX UX-GAP-03: CategoryGrid, FeaturedAds, and RecentAds each ran
 * their own useQuery with an independent isLoading flag, so the
 * homepage settled in three separate, differently-timed jumps —
 * whichever section's request resolved first pushed every section
 * below it down, then the next one did the same, then the next.
 *
 * This wrapper calls the *same* three hooks (identical query keys, so
 * React Query serves the same in-flight/cached request — no
 * duplicate network calls) purely to read their combined loading
 * state. Until every section's data has resolved at least once, the
 * whole block renders one coordinated skeleton shaped like the real
 * layout; once all three are ready, it swaps in the actual sections
 * together in a single paint instead of a cascade.
 *
 * RecommendedAds is deliberately left out of this coordination — it
 * already owns its own self-hiding behavior (renders nothing at all
 * when empty) and sits below the fold, so its independent timing
 * doesn't compound the above-the-fold jump this fix targets.
 */
function SectionHeader({
  eyebrow,
  title,
  icon,
  cta,
}: {
  eyebrow: string;
  title: string;
  icon?: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex items-end justify-between gap-3 border-b pb-3">
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {icon}
          {eyebrow}
        </p>
        <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
      </div>
      {cta && (
        <Link href={cta.href} className="shrink-0 text-sm font-medium text-primary hover:underline">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function HomeAboveFold() {
  const { isLoading: categoriesLoading } = useCategories();
  // UX-FIX (audit P2-01): was useAds({ limit: 20 }) — a different query
  // key than FeaturedAds' own useAds({ isFeatured: true, limit: 4 }),
  // so this fired a second, unnecessary request and its loading flag
  // didn't actually track the Featured section it's meant to
  // coordinate. Matched exactly to FeaturedAds.tsx's real query so
  // React Query serves the same cache entry (no duplicate request) and
  // the coordinated skeleton's timing reflects what's actually shown.
  const { isLoading: featuredLoading } = useAds({ isFeatured: true, limit: 4 });
  const { isLoading: recentLoading } = useAds({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });

  const stillLoading = categoriesLoading || featuredLoading || recentLoading;

  if (stillLoading) {
    return (
      <>
        <section className="container mx-auto space-y-4 px-4 pt-10">
          <SectionHeader eyebrow="تصفح حسب الفئة" title="ماذا تبحث عنه؟" />
          <div className="flex gap-2 overflow-x-auto sm:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="hidden grid-cols-3 gap-3 sm:grid md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </section>

        <section className="mt-10 border-y bg-accent/[0.06] py-10">
          <div className="container mx-auto space-y-4 px-4">
            <SectionHeader
              eyebrow="مميز"
              title="إعلانات مميزة"
              icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <AdCardSkeleton key={i} />)}
            </div>
          </div>
        </section>

        <section className="container mx-auto space-y-4 px-4 pt-10">
          <SectionHeader
            eyebrow="الأحدث"
            title="أحدث الإعلانات"
            icon={<Clock className="h-3.5 w-3.5" />}
            cta={{ href: ROUTES.search, label: 'عرض الكل ←' }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <AdCardSkeleton key={i} />)}
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="container mx-auto space-y-4 px-4 pt-10">
        <SectionHeader eyebrow="تصفح حسب الفئة" title="ماذا تبحث عنه؟" />
        <CategoryGrid />
      </section>

      <section className="mt-10 border-y bg-accent/[0.06] py-10">
        <div className="container mx-auto space-y-4 px-4">
          <SectionHeader
            eyebrow="مميز"
            title="إعلانات مميزة"
            icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
          />
          <FeaturedAds />
        </div>
      </section>

      <section className="container mx-auto space-y-4 px-4 pt-10">
        <SectionHeader
          eyebrow="الأحدث"
          title="أحدث الإعلانات"
          icon={<Clock className="h-3.5 w-3.5" />}
          cta={{ href: ROUTES.search, label: 'عرض الكل ←' }}
        />
        <RecentAds />
      </section>
    </>
  );
}
