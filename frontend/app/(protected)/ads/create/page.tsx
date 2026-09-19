import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateAdGate }  from '@/components/ads/CreateAdGate';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'نشر إعلان جديد', noIndex: true });

// Ad creation is seller-only: CreateAdGate checks for a SellerProfile
// before the form ever mounts, matching ads.service.ts's createAd
// (which now enforces the same rule server-side via
// ensureSellerProfileForAdCreation).
export default function CreateAdPage() {
  return (
    // DESKTOP-AUDIT-05: max-w-2xl → max-w-5xl so AdForm's create-mode
    // split view (form + sticky preview sidebar, see CreateFormLayout)
    // has room for both columns at lg+. AdForm itself still caps its
    // own form column's readable width; this just stops the page
    // shell from clipping the sidebar next to it.
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">نشر إعلان جديد</h1>
      {/* FIX NEXT15-SEARCHPARAMS-SUSPENSE — AdForm also reads
          ?draftId= via useSearchParams; same rule as the other two
          create pages. */}
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        }
      >
        <CreateAdGate />
      </Suspense>
    </div>
  );
}
