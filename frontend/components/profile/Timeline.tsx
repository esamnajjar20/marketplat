'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  ShoppingBag,
  Wrench,
  Store,
  MessageSquare,
  ClipboardList,
  CalendarCheck,
  User,
  History,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { cn } from '@/lib/utils';
import { useMyActivity } from '@/hooks/queries/useActivity';
import { formatRelativeTime } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import type { ActivityGroup, UserActivity } from '@/types/activity.types';

/** Matches activity.validation.ts's ACTIVITY_GROUPS exactly — same 8
 * tabs (الكل/الإعلانات/المنتجات/الخدمات/المتاجر/الرسائل/الطلبات/الحساب),
 * same button-group pattern as SearchTabs.tsx (no shadcn Tabs
 * primitive is installed in this project). */
const GROUP_TABS: { value: ActivityGroup; label: string }[] = [
  { value: 'ALL', label: 'الكل' },
  { value: 'ADS', label: 'الإعلانات' },
  { value: 'PRODUCTS', label: 'المنتجات' },
  { value: 'SERVICES', label: 'الخدمات' },
  { value: 'STORES', label: 'المتاجر' },
  { value: 'MESSAGES', label: 'الرسائل' },
  { value: 'REQUESTS', label: 'الطلبات' },
  { value: 'ACCOUNT', label: 'الحساب' },
];

/** One icon per activity type's underlying domain — mirrors the
 * grouping activity.service.ts's GROUP_TYPES uses server-side, so an
 * ad-related row (created/updated/deleted) always shows the same
 * Megaphone icon regardless of which of the three it is. */
function iconFor(type: UserActivity['type']) {
  if (type.startsWith('AD_')) return Megaphone;
  if (type.startsWith('PRODUCT_')) return ShoppingBag;
  if (type.startsWith('SERVICE_') && !type.startsWith('SERVICE_REQUEST')) return Wrench;
  if (type.startsWith('STORE_') || type.startsWith('FAVORITE_')) return Store;
  if (type === 'MESSAGE_SENT') return MessageSquare;
  if (type.startsWith('SERVICE_REQUEST_')) return ClipboardList;
  if (type.startsWith('APPOINTMENT_')) return CalendarCheck;
  return User; // PROFILE_UPDATED / PASSWORD_CHANGED
}

/** The one place a row's entityId is turned into a link — kept in
 * sync with activity.templates.ts's entityType tags. Returns null for
 * types with no link (account-related rows, or a MESSAGE_SENT row
 * whose conversation may have since been deleted). */
function linkFor(activity: UserActivity): string | null {
  if (!activity.entityId) return null;
  switch (activity.entityType) {
    case 'AD':
      return ROUTES.adDetail(activity.entityId);
    case 'STORE':
      return ROUTES.storeDetail(activity.entityId);
    case 'CONVERSATION':
      return ROUTES.conversationDetail(activity.entityId);
    case 'SERVICE_REQUEST':
      return ROUTES.serviceRequestDetail(activity.entityId);
    // PRODUCT / SERVICE_LISTING / APPOINTMENT: no single-item public
    // route exists for these in ROUTES yet, so no link is rendered —
    // same "link only when a real destination exists" restraint
    // SavedSearchesList.tsx applies to its own "عرض النتائج" link.
    default:
      return null;
  }
}

function ActivityRow({ activity }: { activity: UserActivity }) {
  const Icon = iconFor(activity.type);
  const href = linkFor(activity);
  const statusChange =
    activity.type === 'SERVICE_REQUEST_STATUS_CHANGED' && activity.metadata?.toStatus;

  const content = (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">{activity.title}</p>
          {statusChange && (
            <Badge variant="secondary" className="shrink-0 font-normal">
              {statusChange}
            </Badge>
          )}
        </div>
        {activity.description && (
          <p className="text-sm text-muted-foreground truncate">{activity.description}</p>
        )}
        <p className="text-xs text-muted-foreground">{formatRelativeTime(activity.createdAt)}</p>
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {content}
    </Link>
  );
}

export function Timeline() {
  const [group, setGroup] = useState<ActivityGroup>('ALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch, isFetching } = useMyActivity({
    group,
    q: q.trim() || undefined,
    page,
  });

  function handleGroupChange(next: ActivityGroup) {
    setGroup(next);
    setPage(1);
  }

  function handleSearchChange(next: string) {
    setQ(next);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="تصفية النشاط"
        className="flex gap-1 overflow-x-auto border-b"
      >
        {GROUP_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={group === tab.value}
            onClick={() => handleGroupChange(tab.value)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              group === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="ابحث في نشاطك..."
          className="pr-9"
          aria-label="بحث في النشاط"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل نشاطك</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={<History className="h-10 w-10" />}
          title="لا يوجد نشاط بعد"
          description={
            q.trim()
              ? 'لم يتم العثور على نشاط مطابق لبحثك'
              : 'ستظهر هنا كل الأنشطة المرتبطة بحسابك — الإعلانات، الرسائل، الطلبات وغيرها'
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {data!.items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>

          {data!.meta.totalPages > 1 && (
            <nav
              className="flex items-center justify-center gap-2 py-4"
              aria-label="Pagination"
            >
              {page <= 1 ? (
                <Button variant="outline" size="sm" disabled aria-disabled="true" className="pointer-events-none opacity-50">
                  السابق
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={isFetching}>
                  السابق
                </Button>
              )}
              <span className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
                {page} / {data!.meta.totalPages}
              </span>
              {page >= data!.meta.totalPages ? (
                <Button variant="outline" size="sm" disabled aria-disabled="true" className="pointer-events-none opacity-50">
                  التالي
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={isFetching}>
                  التالي
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
