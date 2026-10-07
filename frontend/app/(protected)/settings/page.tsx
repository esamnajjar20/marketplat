import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsTabsHub } from '@/components/settings/SettingsTabsHub';
import { buildMetadata } from '@/lib/seo';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';

export const metadata: Metadata = buildMetadata({ title: 'الإعدادات', noIndex: true });

// SETTINGS-HUB-01: one route for profile + security + sessions +
// notifications + blocked-users. The active tab lives in ?tab=… and is
// resolved on the client (useSearchParams) so the cached HTML shell is
// identical for every tab. redirect via next.config.
export default function SettingsPage() {
  return (
    <AccountPageShell title="الإعدادات" description="تحكم في ملفك، أمان حسابك، إشعاراتك والجلسات المفتوحة من مكان واحد.">
      <Suspense>
        <SettingsTabsHub />
      </Suspense>
    </AccountPageShell>
  );
}
