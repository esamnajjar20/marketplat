import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminTabsHub } from '@/components/admin/AdminTabsHub';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'لوحة الإدارة', noIndex: true });

/**
 * ADMIN-HUB-01: one route for the whole admin panel. The section lives in
 * ?tab=… (lib/adminHubTabs.ts) and is resolved on the client
 * (useSearchParams), so the HTML shell is identical for every tab. The old
 * /admin/<section> URLs redirect here via next.config.ts. Bare /admin is the
 * dashboard for ADMIN+ and the ads queue for a MODERATOR.
 */
export default function AdminPage() {
  return (
    <Suspense
      fallback={<PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز لوحة الإدارة…" />}
    >
      <AdminTabsHub />
    </Suspense>
  );
}
