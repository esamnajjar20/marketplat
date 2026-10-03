'use client';

import { Megaphone } from 'lucide-react';
import { RecentAds } from '@/components/home/RecentAds';
import { SectionHeader } from '@/components/home/SectionHeader';
import { useBrowseCity } from '@/hooks/useBrowseCity';

/** Dedicated ad rail: ranking combines interest, city priority and freshness. */
export function HomeAboveFold() {
  const { city } = useBrowseCity();

  return (
    <section className="container mx-auto max-w-7xl space-y-3 px-3 pt-1 sm:px-4">
      <SectionHeader
        eyebrow="إعلانات"
        title={city ? `إعلانات تناسبك في ${city}` : 'إعلانات تناسبك'}
        icon={<Megaphone className="h-3.5 w-3.5" />}
      />
      <RecentAds />
    </section>
  );
}
