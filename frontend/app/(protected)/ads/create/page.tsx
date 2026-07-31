import type { Metadata } from 'next';
import { CreateAdGate }  from '@/components/ads/CreateAdGate';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'نشر إعلان جديد', noIndex: true });

// Ad creation is seller-only: CreateAdGate checks for a SellerProfile
// before the form ever mounts, matching ads.service.ts's createAd
// (which now enforces the same rule server-side via
// ensureSellerProfileForAdCreation).
export default function CreateAdPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">نشر إعلان جديد</h1>
      <CreateAdGate />
    </div>
  );
}
