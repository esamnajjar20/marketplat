import type { Metadata } from 'next';
import { ServiceListingForm } from '@/components/services/ServiceListingForm';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'خدمة جديدة', noIndex: true });

export default function NewServiceListingPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">نشر خدمة جديدة</h1>
      <ServiceListingForm mode="create" />
    </div>
  );
}
