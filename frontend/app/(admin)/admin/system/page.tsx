import type { Metadata } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ROUTES } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'صحة النظام', noIndex: true });

// FIX ADMIN-STORM-LAZY-01: both sections were imported statically.
// The page's own heading + quick-links block renders instantly; the
// two heavy sections below fold the actual queries (health probes,
// export tools) — loading them as dynamic chunks keeps them out of
// the initial JS payload and gives each its own Suspense-driven
// loading state instead of a blank page while both resolve. Same
// pattern as app/(admin)/admin/analytics/page.tsx. Note this does
// not by itself cap the number of concurrent queries — the browser
// still mounts both sections once their chunks land — but it does
// cut what has to ship before the first paint.
const AdminSystemHealth = dynamic(
  () =>
    import('@/components/admin/AdminSystemHealth').then(
      (m) => m.AdminSystemHealth,
    ),
  {
    loading: () => (
      <PageLoadingState variant="cards" title="جارٍ فحص الخدمات" description="…" />
    ),
  },
);

const AdminSystemTools = dynamic(
  () =>
    import('@/components/admin/AdminSystemTools').then(
      (m) => m.AdminSystemTools,
    ),
  {
    loading: () => (
      <PageLoadingState variant="minimal" title="جارٍ تحميل الأدوات" description="…" />
    ),
  },
);

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
            <Link href={ROUTES.admin.auditLogs} className="text-primary hover:underline">
              سجل العمليات
            </Link>
          </li>
          <li>
            <Link href={ROUTES.admin.analytics} className="text-primary hover:underline">
              التحليلات
            </Link>
          </li>
          <li>
            <Link href={ROUTES.admin.notifications} className="text-primary hover:underline">
              إدارة الإشعارات
            </Link>
          </li>
          <li>
            <Link href={ROUTES.admin.fraud} className="text-primary hover:underline">
              مكافحة الاحتيال
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
