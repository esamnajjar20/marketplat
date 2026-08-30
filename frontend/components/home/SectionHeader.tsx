import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: string;
  icon?: ReactNode;
  cta?: { href: string; label: string };
  /**
   * Optional small pill under the title — used by location-aware Home
   * sections (RecentAds, NearbyProvidersSection) to show which result
   * source is actually driving the section (📍 قريب منك / 📍 نتائج في
   * {city} / نتائج مقترحة), per the "مؤشر مصدر النتائج" requirement.
   * Kept as a single optional slot (not a dedicated prop per source)
   * so unrelated sections (Products/Stores/Categories/FeaturedAds)
   * are entirely unaffected and never render one.
   */
  badge?: ReactNode;
}

/**
 * Shared section heading for every Home discovery section — extracted
 * from HomeAboveFold.tsx (where it originated) so
 * RecentProductsSection / FeaturedStoresSection / NearbyProvidersSection
 * can reuse the exact same heading treatment instead of each
 * hardcoding their own copy. HomeAboveFold.tsx still owns the
 * coordinated-skeleton logic for its own three sections; only the
 * heading markup moved here.
 */
export function SectionHeader({ eyebrow, title, icon, cta, badge }: Props) {
  return (
    <div className="flex items-end justify-between gap-3 border-b pb-3">
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {icon}
          {eyebrow}
        </p>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
          {badge}
        </div>
      </div>
      {cta && (
        <Link href={cta.href} className="shrink-0 text-sm font-medium text-primary transition-colors hover:text-primary/80 hover:underline underline-offset-4">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
