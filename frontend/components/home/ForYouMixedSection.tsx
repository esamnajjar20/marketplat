'use client';

import Link from 'next/link';
import { Sparkles, AlertTriangle, ChevronLeft } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { ProductCard } from '@/components/stores/ProductCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { useForYouItems } from '@/hooks/queries/useForYouItems';

/** The mixed shelf is assembled from the same single /home/feed response. */
export function ForYouMixedSection() {
  const feed = useHomeFeed();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const items = useForYouItems();

  if (feed.isPending) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 px-3 py-2 sm:space-y-4 sm:px-4 sm:py-3">
        <SectionHeader tone="featured" eyebrow={isAuth ? 'لك' : 'رائج'} title="مخصص لك" icon={<Sparkles className="h-3.5 w-3.5" />} />
        <HomeScrollRail>
          {Array.from({ length: 4 }).map((_, i) => (
            <HomeScrollRailItem key={i} size="wide"><AdCardSkeleton density="compact" /></HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      </section>
    );
  }

  if (feed.isError) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 px-3 py-2 sm:space-y-4 sm:px-4 sm:py-3">
        <SectionHeader tone="featured" eyebrow={isAuth ? 'لك' : 'رائج'} title="مخصص لك" icon={<Sparkles className="h-3.5 w-3.5" />} />
        <div className="flex flex-col items-center gap-2 py-6 text-sm">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
          <p className="text-destructive">تعذّر تحميل الاقتراحات</p>
          <button type="button" onClick={() => void feed.refetch()} className="text-primary hover:underline">إعادة المحاولة</button>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="container mx-auto max-w-7xl space-y-3 px-3 py-2 sm:space-y-4 sm:px-4 sm:py-3">
      <SectionHeader
        tone="featured"
        eyebrow={isAuth ? 'لك' : 'رائج'}
        title="مخصص لك"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        cta={{ href: ROUTES.suggestions, label: 'عرض الكل ←' }}
      />
      <HomeScrollRail className="stagger-fade-in">
        {items.map((item) => (
          <HomeScrollRailItem key={`${item.kind}-${item.data.id}`} size="wide">
            {item.kind === 'ad' ? (
              <AdCard ad={item.data} context="featured" density="compact" showKind />
            ) : item.kind === 'product' ? (
              <ProductCard product={item.data} context="featured" density="compact" showKind mixedList />
            ) : (
              <ServiceListingCard listing={item.data} context="featured" density="compact" showKind />
            )}
          </HomeScrollRailItem>
        ))}
        <HomeScrollRailItem>
          <Link
            href={ROUTES.suggestions}
            prefetch={false}
            className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/80 p-4 text-center text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-card active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </span>
            عرض المزيد
          </Link>
        </HomeScrollRailItem>
      </HomeScrollRail>
      {!isAuth ? (
        <p className="text-center text-xs text-muted-foreground">
          <Link href={ROUTES.login} prefetch={false} className="text-primary hover:underline">سجّل دخولك</Link>{' '}
          لتخصيص الاقتراحات حسب اهتماماتك
        </p>
      ) : null}
    </section>
  );
}
