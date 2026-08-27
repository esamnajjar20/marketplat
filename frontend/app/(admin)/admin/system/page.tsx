import type { Metadata } from 'next';
import { AdminSystemHealth } from '@/components/admin/AdminSystemHealth';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'صحة النظام', noIndex: true });

export default function AdminSystemPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">صحة النظام</h1>
      <AdminSystemHealth />
    </div>
  );
}
