import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerSettingsSection } from '@/components/sellers/SellerSettingsSection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'ملف البائع', noIndex: true });

export default function SellerSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">ملف البائع</h1>
      {/* FIX P0-1: BecomeSellerCard (rendered inside
          SellerSettingsSection) now reads useSearchParams() for ?from=
          — Next.js requires a Suspense boundary around any client
          component using that hook, same as LoginForm's page. */}
      <Suspense>
        <SellerSettingsSection />
      </Suspense>
    </div>
  );
}
