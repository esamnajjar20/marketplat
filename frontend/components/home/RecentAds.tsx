'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { Button }         from '@/components/shared/ui/Button';
import { useAds }         from '@/hooks/queries/useAds';
import { ROUTES }         from '@/lib/constants';

export function RecentAds() {
  const { data, isLoading } = useAds({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });
  const items = data?.items ?? [];

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
        description="كن أول من ينشر إعلاناً في سوق غزة"
        action={
          <Button asChild size="sm">
            <Link href={ROUTES.adCreate}>نشر إعلان مجاناً</Link>
          </Button>
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
