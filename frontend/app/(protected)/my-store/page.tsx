import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StoreSettingsSection } from '@/components/stores/StoreSettingsSection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إدارة المتجر', noIndex: true });

export default function MyStorePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">إدارة المتجر</h1>
      <p className="text-sm text-muted-foreground -mt-4">
        عدّل بيانات المتجر، المنتجات، والمتاجر التي تتابعها
      </p>
      {/* FIX P0-1: BecomeStoreOwnerCard (rendered inside
          StoreSettingsSection) now reads useSearchParams() for ?from= —
          Next.js requires a Suspense boundary around any client
          component using that hook, same as the seller settings page. */}
      <Suspense>
        <StoreSettingsSection />
      </Suspense>
    </div>
  );
}
