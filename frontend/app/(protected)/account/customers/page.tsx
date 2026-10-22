import dynamic from 'next/dynamic';

const CustomersPage = dynamic(
  () => import('@/components/sales/CustomersPageClient'),
  { loading: () => <div className="mx-auto max-w-6xl p-4" dir="rtl">جارٍ تحميل العملاء…</div> },
);

export default function Page() {
  return <CustomersPage />;
}
