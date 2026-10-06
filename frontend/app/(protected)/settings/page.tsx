import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsTabsHub } from '@/components/settings/SettingsTabsHub';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الإعدادات', noIndex: true });

// SETTINGS-HUB-01: one route for profile + security + sessions +
// notifications + blocked-users. The active tab lives in ?tab=… and is
// resolved on the client (useSearchParams) so the cached HTML shell is
// identical for every tab. redirect via next.config.
export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Suspense>
        <SettingsTabsHub />
      </Suspense>
    </div>
  );
}
