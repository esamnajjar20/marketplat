/**
 * مركز المزامنة — /settings/sync
 * مكان واحد لطابور العمليات + مسودات الإعلانات + إعادة المحاولة.
 */
import type { Metadata } from 'next';
import { SyncCenterClient } from '@/components/settings/SyncCenterClient';
import { buildMetadata } from '@/lib/seo';

// SW-FIX-SYNC-NOINDEX: every other /settings/* page routes through
// buildMetadata with noIndex: true — this one used a raw Metadata
// literal and was missing it, leaving the page indexable. Same
// title/description, just through the shared helper.
export const metadata: Metadata = buildMetadata({
  title: 'المزامنة',
  description: 'حالة العمليات والمسودات غير المتزامنة',
  noIndex: true,
});

export default function SyncSettingsPage() {
  return <SyncCenterClient />;
}
