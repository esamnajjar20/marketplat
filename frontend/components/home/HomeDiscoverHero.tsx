'use client';

import { cn } from '@/lib/utils';
import { WelcomeBar } from '@/components/home/WelcomeBar';
import { SearchBox } from '@/components/search/SearchBox';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useMounted } from '@/hooks/useMounted';

/**
 * Homepage discovery hero: one primary search field under a clear headline and
 * one-line value proposition. Type shortcuts were deliberately removed from
 * the hero (see homepageDiscoverPhase60.test) and creation CTAs are not
 * duplicated here.
 */
export function HomeDiscoverHero({ className }: { className?: string }) {
  // FIX HYDRATION-418-HOME-01: the persisted auth store is already hydrated on
  // the FIRST client render but never on the server, so `isHydrated` alone made
  // the WelcomeBar appear in the client tree only → React #418 on every load of
  // "/". Gate on `mounted` so the first client render matches SSR.
  const mounted = useMounted();
  const isHydrated = useAuthStore(selectIsHydrated) && mounted;
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return (
    <section
      aria-labelledby="home-discover-title"
      className={cn(
        'relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/[0.09] via-background to-background',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -start-20 -top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-24 top-1/2 hidden h-56 w-56 rounded-full bg-accent/10 blur-3xl lg:block"
      />
      <div className="relative container mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8 lg:py-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
          <div className="min-w-0">
            <span className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1 text-2xs-tight font-bold text-primary sm:mb-3 sm:text-xs">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
              سوقك المحلي
            </span>
            <h1
              id="home-discover-title"
              className="text-balance text-2xl font-extrabold leading-[1.35] tracking-tight text-foreground sm:text-3xl lg:text-4xl lg:leading-[1.3]"
            >
              السوق المحلي — ابحث، قارن، واكتشف
            </h1>
            {/* Rendered for everyone (SSR included): the old guest-only gating
                made this paragraph pop in after hydration and shifted the whole
                first screen (CLS). */}
            <p className="home-discover-hero-copy mt-2.5 max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:mt-3 sm:text-base">
              إعلانات ومنتجات وخدمات ومتاجر في مكان واحد.
            </p>
            {isHydrated && isAuthenticated ? <div className="mt-3 sm:mt-4"><WelcomeBar /></div> : null}
          </div>

          <div className="min-w-0">
            <div className="max-w-3xl rounded-2xl bg-background/70 p-1 shadow-sm ring-1 ring-border/60 backdrop-blur-sm">
              <SearchBox />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
