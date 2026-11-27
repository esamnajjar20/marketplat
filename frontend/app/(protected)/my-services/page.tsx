import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyServicesTabsHub } from '@/components/services/MyServicesTabsHub';
import { buildMetadata } from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';

export const metadata: Metadata = buildMetadata({ title: 'خدماتي', noIndex: true });

export default function MyServicesPage() {
  return (
    <AccountPageShell title="خدماتي" description="أدر خدماتك وطلبات العملاء ومواعيدك من مكان واحد.">
      <Suspense fallback={<SuspenseFallback />}>
        <MyServicesTabsHub />
      </Suspense>
    </AccountPageShell>
  );
}
