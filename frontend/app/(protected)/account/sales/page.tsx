import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SalesTabsHub } from '@/components/sales/SalesTabsHub';
import { buildMetadata } from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';

export const metadata: Metadata = buildMetadata({ title: 'مبيعاتي', noIndex: true });

export default function SalesPage() {
  return (
    <AccountPageShell title="لوحة المبيعات" description="تابع مبيعاتك ودفعاتك وأرباحك.">
      <Suspense fallback={<SuspenseFallback />}>
        <SalesTabsHub />
      </Suspense>
    </AccountPageShell>
  );
}
