'use client';

import { useState } from 'react';
import { useClampedPage } from '@/hooks/useClampedPage';
import { useParams } from 'next/navigation';
import { useUserFollowing } from '@/hooks/queries/useFollows';
import { FollowPagination, TargetRow } from '@/components/follows/FollowTargetList';

export default function UserFollowingPage() {
  const params = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useUserFollowing(params.id, { page, limit: 20 });
  useClampedPage(page, data?.meta.totalPages, setPage);
  return <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
    <div className="mb-5 flex items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">أتابعهم</h1><p className="mt-1 text-sm text-muted-foreground">المستخدمون والمتاجر والفئات التي يتابعها هذا الحساب</p></div>{data && <span className="text-sm tabular-nums text-muted-foreground">{data.meta.total}</span>}</div>
    {isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">جارٍ تحميل المتابعات…</div> : isError ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><p className="text-sm text-muted-foreground">تعذّر تحميل قائمة المتابعة.</p><button type="button" onClick={() => void refetch()} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">إعادة المحاولة</button></div> : <>{!data?.items.length ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">هذا الحساب لا يتابع أحدًا حتى الآن.</div> : <div className="space-y-2.5">{data.items.map((item) => <TargetRow key={item.id} type={item.targetType} target={item.target} />)}</div>}{isFetching && <p className="mt-2 text-center text-xs text-muted-foreground">جارٍ تحديث القائمة…</p>}<FollowPagination meta={data?.meta} page={page} onPageChange={setPage} /></>}
  </main>;
}
