'use client';

import { useParams } from 'next/navigation';
import { FollowPeopleList } from '@/components/follows/FollowTargetList';
import { useUserFollowers } from '@/hooks/queries/useFollows';

export default function FollowersPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useUserFollowers(params.id, { limit: 50 });
  const people = (data?.items ?? []).map((x) => x.follower).filter((x): x is NonNullable<typeof x> => Boolean(x));
  return <main className="mx-auto max-w-2xl px-4 py-6"><h1 className="mb-5 text-2xl font-bold">المتابعون</h1>{isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</div> : <FollowPeopleList items={people} />}</main>;
}
