'use client';

import { useParams } from 'next/navigation';
import { useUserFollowing } from '@/hooks/queries/useFollows';
import { TargetRow } from '@/components/follows/FollowTargetList';

export default function UserFollowingPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useUserFollowing(params.id, { limit: 50 });
  return <main className="mx-auto max-w-2xl px-4 py-6"><h1 className="mb-5 text-2xl font-bold">أتابعهم</h1>{isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</div> : <div className="space-y-2">{(data?.items ?? []).map((item) => <TargetRow key={item.id} type={item.targetType} target={item.target} />)}</div>}</main>;
}
