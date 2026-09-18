import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { buildMetadata } from '@/lib/seo';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'التحليلات', noIndex: true });

const AdminAnalyticsDashboard = dynamic(
  () =>
    import('@/components/admin/AdminAnalyticsDashboard').then((m) => m.AdminAnalyticsDashboard),
  {
    loading: () => (
      <PageLoadingState variant="cards" title="جارٍ تحميل التحليلات" description="…" />
    ),
    ssr: false,
  },
);

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">التحليلات</h1>
      <AdminAnalyticsDashboard />
    </div>
  );
}
