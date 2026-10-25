import dynamic from 'next/dynamic';

const MyRequestOffersPage = dynamic(
  () => import('@/components/requests/MyRequestOffersPageClient'),
  { loading: () => <div className="mx-auto max-w-3xl p-4" dir="rtl">جاري تحميل العروض…</div> },
);

export default function Page() {
  return <MyRequestOffersPage />;
}
