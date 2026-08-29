import type { Metadata } from 'next';
import { CreateServiceListingGate } from '@/components/services/CreateServiceListingGate';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'خدمة جديدة', noIndex: true });

export default function NewServiceListingPage() {
  return (
    // DESKTOP-AUDIT-05: see ads/create/page.tsx's matching comment.
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">نشر خدمة جديدة</h1>
      <CreateServiceListingGate />
    </div>
  );
}
