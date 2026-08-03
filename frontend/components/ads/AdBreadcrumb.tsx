'use client';

import Link from 'next/link';
import { ChevronLeft, Home } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { useCategoryHref } from '@/components/ads/AdDetail';
import type { Ad } from '@/types/ad.types';

interface Props {
  ad: Ad;
}

/**
 * Design pass (ad detail page): previously the ad detail page dropped
 * the visitor straight into <AdDetail> with zero orientation — no
 * indication of how they got there or how to step back up a level
 * (category → search), just a floating card. This gives the page a
 * sense of place using the same category-slug resolution AdDetail's
 * own category link already relies on (see BUG-05's useCategoryHref),
 * so it's never a second source of truth for that mapping.
 */
export function AdBreadcrumb({ ad }: Props) {
  const categoryHref = useCategoryHref(ad.category?.id);

  return (
    <nav aria-label="مسار التصفح" className="mb-4 flex items-center gap-1.5 overflow-x-auto text-sm text-muted-foreground">
      <Link href={ROUTES.home} className="flex shrink-0 items-center gap-1 hover:text-primary">
        <Home className="h-3.5 w-3.5" />
        الرئيسية
      </Link>
      {ad.category && categoryHref && (
        <>
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          <Link href={categoryHref} className="shrink-0 hover:text-primary">
            {ad.category.nameAr}
          </Link>
        </>
      )}
      <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate text-foreground/80">{ad.title}</span>
    </nav>
  );
}
