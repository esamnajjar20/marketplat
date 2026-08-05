'use client';

/**
 * Gap #7 (product analytics): fires PAGE_VIEW on every route change
 * across the app. Mounted once in AppProviders (same pattern as
 * PwaBootstrap.tsx — a single no-props bootstrap component), so this
 * is the only place PAGE_VIEW needs wiring, unlike AD_VIEW/SEARCH/
 * CATEGORY_BROWSE/CONTACT_CLICK which are each tied to a specific
 * user action on a specific page.
 *
 * Deliberately excludes /admin/* routes — this event stream measures
 * buyer/seller product usage (the funnel the admin dashboard itself
 * reports on); an admin's own navigation around the admin panel isn't
 * "product usage" in that sense, and counting it would quietly inflate
 * PAGE_VIEW with traffic that has nothing to do with the metrics it's
 * meant to inform.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics';

export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/admin')) return;
    track('PAGE_VIEW');
  }, [pathname]);

  return null;
}
