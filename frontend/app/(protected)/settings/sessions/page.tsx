import type { Metadata }     from 'next';
import { ActiveSessionsList } from '@/components/profile/ActiveSessionsList';
import { buildMetadata }     from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الجلسات النشطة', noIndex: true });

export default function SessionsPage() {
  return (
    <div className="space-y-6">
      <ActiveSessionsList />
    </div>
  );
}
