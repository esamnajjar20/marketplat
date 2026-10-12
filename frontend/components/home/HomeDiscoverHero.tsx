'use client';

import { cn } from '@/lib/utils';
import { WelcomeBar } from '@/components/home/WelcomeBar';
import { SearchBox } from '@/components/search/SearchBox';
import { HomeTypeShortcuts } from '@/components/home/HomeTypeShortcuts';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';

/**
 * Homepage discovery hero: one primary search field followed by four direct
 * category shortcuts, so mobile visitors can jump to the right marketplace
 * surface without opening the global menu. It does not duplicate creation CTAs.
 */
export function HomeDiscoverHero({ className }: { className?: string }) {
  const isHydrated = useAuthStore(selectIsHydrated);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const showGuestCopy = isHydrated && !isAuthenticated;

  return (
    <section
      aria-labelledby="home-discover-title"
      className={cn(
        'relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/[0.08] via-background to-background',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -start-16 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 lg:py-8">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
          <div className="min-w-0">
            <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1 text-[11px] font-bold text-primary sm:mb-3 sm:text-xs">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
              سوقك المحلي
            </span>
            <h1
              id="home-discover-title"
              className="text-balance text-xl font-extrabold leading-tight tracking-tight text-foreground sm:text-2xl lg:text-3xl"
            >
              السوق المحلي — ابحث، قارن، واكتشف
            </h1>
            {showGuestCopy ? (
              <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground sm:mt-3 sm:text-base">
                إعلانات ومنتجات وخدمات ومتاجر في مكان واحد.
              </p>
            ) : null}
            {isHydrated && isAuthenticated ? <div className="mt-3 sm:mt-4"><WelcomeBar /></div> : null}
          </div>

          <div className="min-w-0 space-y-3 sm:space-y-4">
            <div className="max-w-3xl">
              <SearchBox />
            </div>
            <div className="max-w-3xl">
              <HomeTypeShortcuts />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
