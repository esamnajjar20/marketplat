/**
 * مركز المزامنة — /settings/sync
 * مكان واحد لطابور العمليات + مسودات الإعلانات + إعادة المحاولة.
 */
import type { Metadata } from 'next';
import { SyncCenterClient } from '@/components/settings/SyncCenterClient';

export const metadata: Metadata = {
  title: 'المزامنة',
  description: 'حالة العمليات والمسودات غير المتزامنة',
};

export default function SyncSettingsPage() {
  return <SyncCenterClient />;
}
