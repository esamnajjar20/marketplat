import dynamic from 'next/dynamic';

const InstallmentsPage = dynamic(
  () => import('@/components/sales/InstallmentsPageClient'),
  { loading: () => <div className="mx-auto max-w-5xl p-4" dir="rtl">جارٍ تحميل الأقساط…</div> },
);

export default function Page() {
  return <InstallmentsPage />;
}
