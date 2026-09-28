'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Compass } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { CreateSheet } from '@/components/layout/CreateSheet';
import { ExploreSheet } from '@/components/layout/ExploreSheet';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Homepage hero strip (no search — PublicHeader owns SearchBar).
 * Trust details live in HomeTrustStrip (Phase C) to avoid duplicate copy.
 */
export function HomeDiscoverHero({ className }: { className?: string }) {
  const isHydrated = useAuthStore(selectIsHydrated);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const [createOpen, setCreateOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);

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
      <div className="relative container mx-auto max-w-7xl space-y-3 px-4 py-4 sm:space-y-3.5 sm:py-5">
        {/* h1 دائمًا في الـ HTML (SEO/قارئات الشاشة). يظهر بصريًا للزائر فقط،
            وللمسجّل يبقى sr-only فلا يرى شعارًا تسويقيًا. */}
        <div className={showGuestCopy ? 'space-y-1' : undefined}>
          <h1
            className={cn(
              'text-balance font-bold tracking-tight text-foreground',
              showGuestCopy ? 'text-xl sm:text-2xl' : 'sr-only',
            )}
          >
            سوق غزة المحلي — ابحث، اشترِ، أو اعرض
          </h1>
          {showGuestCopy ? (
            <p className="max-w-xl text-pretty text-sm text-muted-foreground">
              إعلانات ومنتجات وخدمات من جيرانك — تواصل مباشر بلا وسطاء.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 rounded-xl px-3.5 font-semibold"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            نشر مجاناً
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 rounded-xl border-border/80 bg-card/70 px-3.5 font-semibold"
            onClick={() => setExploreOpen(true)}
          >
            <Compass className="h-4 w-4 text-primary" aria-hidden />
            استكشف
          </Button>
          {!isAuthenticated && isHydrated ? (
            <Button asChild size="sm" variant="ghost" className="h-9 rounded-xl text-muted-foreground">
              <Link href={ROUTES.login} prefetch={false}>
                تسجيل الدخول
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
      <ExploreSheet open={exploreOpen} onOpenChange={setExploreOpen} />
    </section>
  );
}
