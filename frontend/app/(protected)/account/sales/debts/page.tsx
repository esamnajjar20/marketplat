import dynamic from 'next/dynamic';

const DebtsPage = dynamic(
  () => import('@/components/sales/DebtsPageClient'),
  { loading: () => <div className="mx-auto max-w-5xl p-4" dir="rtl">جارٍ تحميل الديون…</div> },
);

export default function Page() {
  return <DebtsPage />;
}
