import dynamic from 'next/dynamic';

const MyFollowingList = dynamic(
  () =>
    import('@/components/follows/FollowTargetList').then(
      (module) => module.MyFollowingList,
    ),
  { loading: () => <div className="mx-auto max-w-2xl px-4 py-6" dir="rtl">جارٍ تحميل المتابعات…</div> },
);

export default function FollowingPage() {
  return <main className="mx-auto max-w-2xl px-4 py-6"><h1 className="mb-5 text-2xl font-bold">متابعاتي</h1><MyFollowingList /></main>;
}
