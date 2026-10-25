import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateAdGate } from '@/components/ads/CreateAdGate';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'نشر إعلان جديد', noIndex: true });

/**
 * Phase 3: create-form-native-shell marks the page for denser native chrome.
 * AdForm already runs a 3-step wizard (بيانات → تصنيف/سعر → صور) with
 * ImageUpload → native Camera on Capacitor.
 */
export default function CreateAdPage() {
  return (
    <div className="create-form-native-shell mx-auto max-w-5xl space-y-4 px-3 sm:px-4">
      <h1 className="text-xl font-bold">نشر إعلان جديد</h1>
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
