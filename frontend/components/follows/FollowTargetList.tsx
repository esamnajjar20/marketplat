'use client';

import { useState } from 'react';
import { useClampedPage } from '@/hooks/useClampedPage';
import Link from 'next/link';
import { FolderOpen, Store, UserRound, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMyFollowing, useFollowStatus } from '@/hooks/queries/useFollows';
import { useToggleFollow } from '@/hooks/mutations/useFollowMutations';
import { useAuthStore } from '@/store/auth.store';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import type { FollowCategory, FollowPerson, FollowStore, FollowTargetType } from '@/api/follows.api';
import type { PaginationMeta } from '@/types/api.types';

import { Spinner } from '@/components/ui/spinner';
export function FollowPagination({ meta, page, onPageChange }: { meta?: PaginationMeta; page: number; onPageChange: (page: number) => void }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav aria-label="صفحات المتابعة" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2">
      <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
        <ChevronRight className="h-4 w-4" /> السابق
      </button>
      <span className="text-xs tabular-nums text-muted-foreground">صفحة {page} من {meta.totalPages}</span>
      <button type="button" onClick={() => onPageChange(Math.min(meta.totalPages, page + 1))} disabled={!meta.hasNextPage} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
        التالي <ChevronLeft className="h-4 w-4" />
      </button>
    </nav>
  );
}

function FollowAvatar({ src, name, kind }: { src?: string | null; name: string; kind: 'user' | 'store' | 'category' }) {
  if (src) return <SafeImage src={src} alt={name} width={48} height={48} className="h-12 w-12 shrink-0 rounded-full border border-border/60 object-cover" />;
  const Icon = kind === 'store' ? Store : kind === 'category' ? FolderOpen : UserRound;
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="h-5 w-5" /></span>;
}

export function TargetRow({ type, target }: { type: FollowTargetType; target: FollowPerson | FollowStore | FollowCategory | null | undefined }) {
  const targetId = target ? (type === 'CATEGORY' ? `${(target as FollowCategory).categoryType}:${target.id}` : target.id) : '';
  const { data: following = false, isLoading: statusLoading } = useFollowStatus(type, targetId);
  const toggle = useToggleFollow();
  if (!target) return null;

  let href = '#';
  let label = '';
  let subtitle = '';
  let image: string | null = null;
  let kind: 'user' | 'store' | 'category' = 'user';
  if (type === 'USER') {
    const person = target as FollowPerson;
    href = `/profile/${person.id}`;
    label = person.name;
    subtitle = person.city ?? 'حساب مستخدم';
    image = person.avatarUrl;
  } else if (type === 'STORE') {
    const store = target as FollowStore;
    href = `/stores/${store.id}`;
    label = store.name;
    subtitle = store.city || 'متجر';
    image = store.logoUrl;
    kind = 'store';
  } else {
    const category = target as FollowCategory;
    href = category.categoryType === 'AD' ? `/categories/${category.slug}` : `/search?type=${category.categoryType === 'PRODUCT' ? 'products' : 'services'}&categoryId=${category.id}`;
    label = category.nameAr || category.name;
    subtitle = category.categoryType === 'AD' ? 'فئة الإعلانات' : category.categoryType === 'PRODUCT' ? 'فئة المنتجات' : 'فئة الخدمات';
    kind = 'category';
  }

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md sm:p-4">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <FollowAvatar src={image} name={label} kind={kind} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">{label}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </Link>
      <button
        type="button"
        disabled={statusLoading || toggle.isPending}
        aria-pressed={following}
        onClick={() => toggle.mutate({ targetType: type, targetId })}
        className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-4 ${following ? 'border-border bg-muted/60 text-foreground hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive' : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'}`}
      >
        {(statusLoading || toggle.isPending) && <Spinner size="xs" />}
        {statusLoading ? 'جارٍ التحقق' : toggle.isPending ? 'جارٍ التحديث' : following ? 'تتابعه' : 'متابعة'}
      </button>
    </div>
  );
}

export function MyFollowingList() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useMyFollowing({ page, limit: 20 });
  useClampedPage(page, data?.meta.totalPages, setPage);
  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">جارٍ تحميل المتابعات…</div>;
  if (isError) return <div className="rounded-2xl border border-dashed border-border p-8 text-center"><p className="text-sm text-muted-foreground">تعذّر تحميل قائمة المتابعة.</p><button type="button" onClick={() => void refetch()} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">إعادة المحاولة</button></div>;
  if (!data?.items.length && page === 1) return <div className="rounded-2xl border border-dashed border-border p-10 text-center"><UserRound className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">لا توجد متابعات بعد</p><p className="mt-1 text-sm text-muted-foreground">عندما تتابع مستخدمًا أو متجرًا أو فئة، ستظهر هنا.</p></div>;
  return <>
    <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{data?.meta.total ?? 0} متابعة</span>{isFetching && <span className="inline-flex items-center gap-1"><Spinner size="xs" /> تحديث القائمة</span>}</div>
    <div className="space-y-2.5">{data?.items.map((item) => <TargetRow key={item.id} type={item.targetType} target={item.target} />)}</div>
    <FollowPagination meta={data?.meta} page={page} onPageChange={setPage} />
  </>;
}

function FollowPersonRow({ user }: { user: FollowPerson }) {
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { data: following = false, isLoading: statusLoading } = useFollowStatus('USER', user.id);
  const toggle = useToggleFollow();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition hover:border-primary/30 sm:p-4">
      <Link href={`/profile/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <FollowAvatar src={user.avatarUrl} name={user.name} kind="user" />
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{user.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{user.city || 'مستخدم في Marketplat'}</span></span>
      </Link>
      {currentUserId !== user.id && <button type="button" disabled={statusLoading || toggle.isPending} aria-pressed={following} onClick={() => toggle.mutate({ targetType: 'USER', targetId: user.id })} className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition disabled:opacity-60 ${following ? 'border-border bg-muted/60 hover:bg-muted' : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'}`}>
        {(statusLoading || toggle.isPending) && <Spinner size="xs" />}{statusLoading ? 'جارٍ التحقق' : toggle.isPending ? 'جارٍ التحديث' : following ? 'تتابعه' : 'متابعة'}
      </button>}
    </div>
  );
}

export function FollowPeopleList({ items, empty = 'لا يوجد مستخدمون.' }: { items: FollowPerson[]; empty?: string }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{empty}</div>;
  return <div className="space-y-2.5">{items.map((user) => <FollowPersonRow key={user.id} user={user} />)}</div>;
}
