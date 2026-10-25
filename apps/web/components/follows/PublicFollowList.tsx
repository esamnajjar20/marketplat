import Link from 'next/link';
import { ChevronLeft, ChevronRight, FolderOpen, Store, UserRound } from 'lucide-react';
import { FollowActionButton } from '@/components/follows/FollowActionButton';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import type {
  FollowCategory,
  FollowPerson,
  FollowStore,
  FollowTargetType,
} from '@/api/follows.api';
import type { PaginationMeta } from '@/types/api.types';

function FollowAvatar({
  src,
  name,
  kind,
}: {
  src?: string | null;
  name: string;
  kind: 'user' | 'store' | 'category';
}) {
  if (src) {
    return (
      <SafeImage
        src={src}
        alt={name}
        width={48}
        height={48}
        className="h-12 w-12 shrink-0 rounded-full border border-border/60 object-cover"
      />
    );
  }
  const Icon = kind === 'store' ? Store : kind === 'category' ? FolderOpen : UserRound;
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function PublicFollowersList({
  items,
  empty,
}: {
  items: FollowPerson[];
  empty: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((user) => (
        <div
          key={user.id}
          className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition hover:border-primary/30 sm:p-4"
        >
          <Link
            href={`/profile/${user.id}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <FollowAvatar src={user.avatarUrl} name={user.name} kind="user" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{user.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {user.city || 'مستخدم في Marketplat'}
              </span>
            </span>
          </Link>
          <FollowActionButton targetType="USER" targetId={user.id} userId={user.id} />
        </div>
      ))}
    </div>
  );
}

function PublicFollowingRow({
  type,
  target,
}: {
  type: FollowTargetType;
  target: FollowPerson | FollowStore | FollowCategory | null | undefined;
}) {
  if (!target) return null;

  let href = '#';
  let label = '';
  let subtitle = '';
  let image: string | null = null;
  let kind: 'user' | 'store' | 'category' = 'user';
  let targetId = target.id;

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
    targetId = `${category.categoryType}:${category.id}`;
    href =
      category.categoryType === 'AD'
        ? `/categories/${category.slug}`
        : `/search?type=${category.categoryType === 'PRODUCT' ? 'products' : 'services'}&categoryId=${category.id}`;
    label = category.nameAr || category.name;
    subtitle =
      category.categoryType === 'AD'
        ? 'فئة الإعلانات'
        : category.categoryType === 'PRODUCT'
          ? 'فئة المنتجات'
          : 'فئة الخدمات';
    kind = 'category';
  }

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md sm:p-4">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <FollowAvatar src={image} name={label} kind={kind} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">{label}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </Link>
      <FollowActionButton targetType={type} targetId={targetId} />
    </div>
  );
}

export function PublicFollowingList({
  items,
  empty,
}: {
  items: Array<{
    id: string;
    targetType: FollowTargetType;
    target?: FollowPerson | FollowStore | FollowCategory | null;
  }>;
  empty: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <PublicFollowingRow key={item.id} type={item.targetType} target={item.target} />
      ))}
    </div>
  );
}

export function PublicFollowPagination({
  meta,
  page,
  basePath,
}: {
  meta: PaginationMeta;
  page: number;
  basePath: string;
}) {
  if (meta.totalPages <= 1) return null;
  const pageHref = (nextPage: number) => `${basePath}?page=${nextPage}`;

  return (
    <nav
      aria-label="صفحات المتابعة"
      className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2"
    >
      {page > 1 ? (
        <Link
          href={pageHref(page - 1)}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium transition hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" /> السابق
        </Link>
      ) : (
        <span className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground">
          <ChevronRight className="h-4 w-4" /> السابق
        </span>
      )}
      <span className="text-xs tabular-nums text-muted-foreground">
        صفحة {page} من {meta.totalPages}
      </span>
      {meta.hasNextPage ? (
        <Link
          href={pageHref(page + 1)}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium transition hover:bg-muted"
        >
          التالي <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground">
          التالي <ChevronLeft className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
