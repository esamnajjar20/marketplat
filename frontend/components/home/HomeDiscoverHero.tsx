'use client';

import { cn } from '@/lib/utils';
import { WelcomeBar } from '@/components/home/WelcomeBar';
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
            سوق غزة المحلي — ابحث، اشترِ، أو اعرض
          </h1>
          {showGuestCopy ? (
            <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
              إعلانات ومنتجات وخدمات ومتاجر من السوق المحلي.
            </p>
          ) : null}
          {isHydrated && isAuthenticated ? <WelcomeBar /> : null}
        </div>
      </div>
    </section>
  );
}
