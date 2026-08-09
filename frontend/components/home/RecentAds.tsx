'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { Button }         from '@/components/shared/ui/Button';
import { useAds }         from '@/hooks/queries/useAds';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES }         from '@/lib/constants';

export function RecentAds() {
  const { data, isLoading } = useAds({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });
  const items = data?.items ?? [];
  // FIX P1-10: /ads/create is a protected route — an unauthenticated
  // visitor tapping this CTA was immediately bounced to /login with no
  // warning. Route them to registration/login instead of dangling a
  // link that looks like it publishes an ad but actually interrupts
  // them.
  const isAuth = useAuthStore(selectIsAuthenticated);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  // FIX (audit note, home page §1): previously returned bare cards with
  // no fallback at all when the list came back empty — a brand-new or
  // freshly-seeded marketplace would show an empty grid with no
  // explanation and no next step. Mirrors the EmptyState pattern used
  // everywhere else in the app (SearchResults, StoresGrid, ...).
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch className="h-8 w-8" />}
        title="لا توجد إعلانات بعد"
        description={isAuth ? 'كن أول من ينشر إعلاناً في سوق غزة' : 'سجّل دخولك لتكون أول من ينشر إعلاناً في سوق غزة'}
        action={
          isAuth ? (
            <Button asChild size="sm">
              <Link href={ROUTES.adCreate}>نشر إعلان مجاناً</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              {/* FIX P1-10: label states the reason for the redirect —
                  the guest shouldn't have to guess why they're being sent
                  to login. ?from= already carried the intent; this just
                  makes the button say it too. */}
              <Link href={`${ROUTES.login}?from=${encodeURIComponent(ROUTES.adCreate)}`}>تسجيل الدخول لنشر إعلان</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>
      <div className="flex justify-center">
        <Link href={ROUTES.search}>
          <Button variant="outline">عرض جميع الإعلانات</Button>
        </Link>
      </div>
    </div>
  );
}
