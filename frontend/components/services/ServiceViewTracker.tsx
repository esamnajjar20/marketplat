'use client';

/**
 * PR4A (recommendation view signals): fires SERVICE_VIEW once per
 * service-listing detail load — the SERVICE_LISTING counterpart of
 * AdDetailSection.tsx's AD_VIEW effect.
 *
 * Unlike /ads/[id] (AdDetailSection is already a client component
 * fetching via useAd()), /services/[id]/page.tsx is a Server Component
 * that fetches the listing server-side and passes it straight to
 * ServiceListingDetail as a prop — there's no client-side query hook
 * to hang a useEffect off. Same shape as PageViewTracker.tsx: a small,
 * render-nothing client component mounted alongside the server-rendered
 * content, given just the id/categoryId it needs as props instead of
 * fetching anything itself.
 *
 * Dependency array is the same dedup mechanism AD_VIEW's effect uses —
 * this only re-fires if the listing id or category actually changes
 * (e.g. client-side navigation from one listing's page straight to
 * another's, which reuses this component instance), never on an
 * unrelated re-render of the page around it.
 */
import { useEffect } from 'react';
import { track } from '@/lib/analytics';

interface Props {
  serviceListingId: string;
  categoryId?: string;
}

export function ServiceViewTracker({ serviceListingId, categoryId }: Props) {
  useEffect(() => {
    if (serviceListingId) {
      track('SERVICE_VIEW', { serviceListingId, categoryId });
    }
  }, [serviceListingId, categoryId]);

  return null;
}
