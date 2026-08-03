import type { Metadata }     from 'next';
import { ActiveSessionsList } from '@/components/profile/ActiveSessionsList';
import { buildMetadata }     from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الجلسات النشطة', noIndex: true });

export default function SessionsPage() {
  return (
    <div className="space-y-6">
      {/* AUDIT-FIX (protected #6): page had no <h1>, breaking the
          heading hierarchy (screen readers jumped straight to
          ActiveSessionsList's internal <h2>). Matches the pattern used
          by profile/security/seller/service-provider. */}
      <h1 className="text-xl font-bold">الجلسات النشطة</h1>
      <ActiveSessionsList />
    </div>
  );
}
