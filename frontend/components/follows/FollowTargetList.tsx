'use client';

import Link from 'next/link';
import { FolderOpen, Store, UserRound } from 'lucide-react';
import { useMyFollowing, useFollowStatus } from '@/hooks/queries/useFollows';
import { useToggleFollow } from '@/hooks/mutations/useFollowMutations';
import { useAuthStore } from '@/store/auth.store';
import type { FollowCategory, FollowPerson, FollowStore, FollowTargetType } from '@/api/follows.api';

export function TargetRow({ type, target }: { type: FollowTargetType; target: FollowPerson | FollowStore | FollowCategory | null | undefined }) {
  const targetId = target ? (type === 'CATEGORY' ? `${(target as FollowCategory).categoryType}:${target.id}` : target.id) : '';
  const { data: following = true } = useFollowStatus(type, targetId);
  const toggle = useToggleFollow();
  if (!target) return null;
  let href = '#';
  let icon = <UserRound className="h-5 w-5" />;
  let label = '';
  if (type === 'USER') { const t = target as FollowPerson; href = `/profile/${t.id}`; label = t.name; }
  else if (type === 'STORE') { const t = target as FollowStore; href = `/stores/${t.id}`; icon = <Store className="h-5 w-5" />; label = t.name; }
  else { const t = target as FollowCategory; href = t.categoryType === 'AD' ? `/categories/${t.slug}` : `/search?type=${t.categoryType === 'PRODUCT' ? 'products' : 'services'}&categoryId=${t.id}`; icon = <FolderOpen className="h-5 w-5" />; label = t.nameAr; }
  return <div className="flex items-center gap-3 rounded-xl border border-border p-3">
    <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary">{icon}<span className="truncate font-medium">{label}</span></Link>
    <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ targetType: type, targetId })} className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">{following ? 'إلغاء المتابعة' : 'متابعة'}</button>
  </div>;
}

export function MyFollowingList() {
  const { data, isLoading } = useMyFollowing({ limit: 50 });
  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">جارٍ تحميل المتابعات…</div>;
  if (!data?.items.length) return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">لا توجد متابعات بعد.</div>;
  return <div className="space-y-2">{data.items.map((item) => <TargetRow key={item.id} type={item.targetType} target={item.target} />)}</div>;
}

function FollowPersonRow({ user }: { user: { id: string; name: string; avatarUrl: string | null; city: string | null } }) {
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { data: following = false } = useFollowStatus('USER', user.id);
  const toggle = useToggleFollow();
  return <div className="flex items-center gap-3 rounded-xl border border-border p-3">
    <Link href={`/profile/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3">
      <UserRound className="h-5 w-5 shrink-0" />
      <span className="truncate font-medium">{user.name}</span>
      <span className="ms-auto shrink-0 text-xs text-muted-foreground">{user.city ?? ''}</span>
    </Link>
    {currentUserId !== user.id && <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ targetType: 'USER', targetId: user.id })} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">{following ? 'متابَع' : 'متابعة'}</button>}
  </div>;
}

export function FollowPeopleList({ items, empty = 'لا يوجد مستخدمون.' }: { items: Array<{ id: string; name: string; avatarUrl: string | null; city: string | null }>; empty?: string }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{empty}</div>;
  return <div className="space-y-2">{items.map((user) => <FollowPersonRow key={user.id} user={user} />)}</div>;
}
