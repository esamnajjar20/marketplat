import type { Metadata } from 'next';
import { AdminAnalyticsDashboard } from '@/components/admin/AdminAnalyticsDashboard';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'التحليلات', noIndex: true });

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">التحليلات</h1>
      <AdminAnalyticsDashboard />
    </div>
  );
}
