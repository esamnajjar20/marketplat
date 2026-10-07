'use client';

import { cn } from '@/lib/utils';
import { WelcomeBar } from '@/components/home/WelcomeBar';
import { SearchBox } from '@/components/search/SearchBox';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';

/**
 * The homepage hero is intentionally informational only. Creation and
 * exploration already exist in global navigation, so repeating them here
 * wastes the first viewport and competes with discovery.
 */
export function HomeDiscoverHero({ className }: { className?: string }) {
  const isHydrated = useAuthStore(selectIsHydrated);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const showGuestCopy = isHydrated && !isAuthenticated;

  return (
    <section
      className={cn(
        'relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/[0.07] via-background to-background',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -start-16 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative container mx-auto max-w-7xl px-4 py-3 sm:py-4">
        <div className="min-h-[2.75rem] sm:min-h-[3rem]">
          <h1
            className={cn(
              'text-balance font-bold tracking-tight text-foreground',
              showGuestCopy ? 'text-base leading-snug sm:text-2xl' : 'sr-only',
            )}
          >
            السوق المحلي — ابحث، قارن، واكتشف
          </h1>
          {showGuestCopy ? (
            <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
              إعلانات ومنتجات وخدمات ومتاجر في مكان واحد.
            </p>
          ) : null}
          {isHydrated && isAuthenticated ? <WelcomeBar /> : null}
          <div className="mt-3 max-w-2xl">
            <SearchBox />
          </div>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="اختصارات الاستكشاف">
            <a href="/services" className="min-h-9 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">الخدمات</a>
            <a href="/products" className="min-h-9 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">المنتجات</a>
            <a href="/ads" className="min-h-9 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">الإعلانات</a>
            <a href="/stores" className="min-h-9 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">المتاجر</a>
          </div>
        </div>
      </div>
    </section>
  );
}
