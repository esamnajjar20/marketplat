import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminSystemHealth } from '@/components/admin/AdminSystemHealth';
import { AdminSystemTools } from '@/components/admin/AdminSystemTools';
import { ROUTES } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'صحة النظام', noIndex: true });

export default function AdminSystemPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">صحة النظام والأدوات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          فحص الخدمات الحية وأدوات تشغيلية سريعة للمشرف.
        </p>
      </div>
      <AdminSystemHealth />
      <AdminSystemTools />
      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">روابط سريعة</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li>
            <Link prefetch={false} href={ROUTES.admin.auditLogs} className="text-primary hover:underline">
              سجل العمليات
            </Link>
          </li>
          <li>
            <Link prefetch={false} href={ROUTES.admin.analytics} className="text-primary hover:underline">
              التحليلات
            </Link>
          </li>
          <li>
            <Link prefetch={false} href={ROUTES.admin.notifications} className="text-primary hover:underline">
              إدارة الإشعارات
            </Link>
          </li>
          <li>
            <Link prefetch={false} href={ROUTES.admin.fraud} className="text-primary hover:underline">
              مكافحة الاحتيال
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
