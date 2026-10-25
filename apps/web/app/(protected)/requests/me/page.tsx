import dynamic from 'next/dynamic';

const MyRequestsPage = dynamic(
  () => import('@/components/requests/MyRequestsPageClient'),
  { loading: () => <div className="mx-auto max-w-5xl p-4" dir="rtl">جاري تحميل الطلبات…</div> },
);

export default function Page() {
  return <MyRequestsPage />;
}
