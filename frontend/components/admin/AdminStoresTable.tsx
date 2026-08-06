'use client';

/**
 * AdminStoresTable — audit report issue #1 (🔴 critical).
 *
 * The report's finding: POST /stores creates a store in PENDING status
 * and requires admin approval to go live (see stores.service.ts's
 * updateStoreStatus, which existed fully server-side), but GET /stores
 * (public) is hardcoded to `status: 'ACTIVE'` — so there was no
 * endpoint, let alone UI, that could ever list a PENDING store. Every
 * new store stayed PENDING forever. GET /admin/stores now exists
 * (admin.routes.ts + stores.repository.ts's findManyForAdmin) and this
 * table is the missing approval UI.
 *
 * Mirrors AdminSellersTable.tsx's structure: search input, status
 * filter tabs (the equivalent of sellers' verified/suspended toggle,
 * but for the 3-state PENDING/ACTIVE/BLOCKED status), table, per-row
 * action buttons, pagination. A block action gets a ConfirmDialog since
 * it hides a live store from the public directory; approving a PENDING
 * store and un-blocking are both a single click, same asymmetry as
 * AdminSellersTable's verify vs. suspend.
 */

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Ban, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { Badge }         from '@/components/shared/ui/Badge';
import { Input }         from '@/components/shared/ui/Input';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAdminStores } from '@/hooks/queries/useAdmin';
import { useAdminUpdateStoreStatus } from '@/hooks/mutations/useAdminMutations';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { AdminStoreStatus } from '@/types/admin.types';

const STATUS_TABS: { value: AdminStoreStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'قيد المراجعة' },
  { value: 'ACTIVE',  label: 'نشطة' },
  { value: 'BLOCKED', label: 'محظورة' },
  { value: 'ALL',     label: 'الكل' },
];

// FIX SEC-3.9: `statusParam` comes straight out of URLSearchParams —
// any string a user can type into the address bar, not something the
// type system already constrains. The previous `as AdminStoreStatus`
// cast asserted that without checking it, so an arbitrary/stale/typo'd
// `?status=` value would silently masquerade as a valid status instead
// of falling back to the safe PENDING default below. This is a real
// runtime check.
const VALID_STORE_STATUSES = new Set<AdminStoreStatus>(['PENDING', 'ACTIVE', 'BLOCKED']);
function isAdminStoreStatus(value: string | null): value is AdminStoreStatus {
  return !!value && VALID_STORE_STATUSES.has(value as AdminStoreStatus);
}

const STATUS_BADGE: Record<AdminStoreStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  PENDING: { label: 'قيد المراجعة', variant: 'secondary' },
  ACTIVE:  { label: 'نشط',          variant: 'default' },
  BLOCKED: { label: 'محظور',        variant: 'destructive' },
};

export function AdminStoresTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  const page   = Number(sp.get('page') ?? 1);
  const q      = sp.get('q') ?? '';
  // Defaults to PENDING — that's the queue an admin opens this page to
  // clear; without a default, the first paint would show newest-first
  // across all statuses and bury the stores actually needing action.
  const statusParam = sp.get('status');
  const status: AdminStoreStatus | 'ALL' = statusParam === 'ALL'
    ? 'ALL'
    : isAdminStoreStatus(statusParam) ? statusParam : 'PENDING';

  const { data, isLoading, isError, refetch } = useAdminStores({
    page,
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
  });
  const updateStatus = useAdminUpdateStoreStatus();

  const pendingId = updateStatus.isPending ? updateStatus.variables?.storeId : undefined;

  // Blocking hides an already-live store from the public directory and
  // from its followers — consequential enough to confirm, same
  // reasoning as AdminSellersTable's suspend action. Approving a
  // PENDING store and un-blocking a BLOCKED one are both single-click.
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null);

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    params.delete('page');
    router.push(`/admin/stores?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => {
          const isActive = tab.value === status;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => updateParams({ status: tab.value })}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-input hover:bg-muted',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <Input placeholder="بحث باسم المتجر…" defaultValue={q}
        onBlur={(e) => updateParams({ q: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') updateParams({ q: (e.target as HTMLInputElement).value }); }}
        className="max-w-xs" />

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : isError ? (
        // Same UX-FIX P1-9 reasoning as AdminSellersTable: a failed
        // fetch must not render as "لا توجد متاجر" — that would wrongly
        // read as "there are genuinely no pending stores."
        <div className="flex flex-col items-center gap-3 py-12 text-center rounded-lg border">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل المتاجر</p>
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-3 font-medium">المتجر</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">البائع</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">المدينة</th>
                <th className="text-start p-3 font-medium">الحالة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">تاريخ الإنشاء</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((store) => {
                const badge = STATUS_BADGE[store.status];
                return (
                  <tr key={store.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <span className="font-medium">{store.name}</span>
                      <span className="block text-xs text-muted-foreground md:hidden">
                        {store.sellerProfile.displayName}
                      </span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">
                      {store.sellerProfile.displayName}
                    </td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{store.city}</td>
                    <td className="p-3">
                      <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {formatDate(store.createdAt)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {store.status !== 'ACTIVE' && (
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            title="الموافقة على المتجر"
                            aria-label={`الموافقة على متجر ${store.name}`}
                            disabled={pendingId === store.id}
                            onClick={() => updateStatus.mutate({ storeId: store.id, status: 'ACTIVE' })}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          </Button>
                        )}
                        {store.status === 'BLOCKED' ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            title="رفع الحظر"
                            aria-label={`رفع الحظر عن متجر ${store.name}`}
                            disabled={pendingId === store.id}
                            onClick={() => updateStatus.mutate({ storeId: store.id, status: 'PENDING' })}>
                            <RotateCcw className="h-3.5 w-3.5 text-success" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            title="حظر المتجر"
                            aria-label={`حظر متجر ${store.name}`}
                            disabled={pendingId === store.id}
                            onClick={() => setBlockTarget({ id: store.id, name: store.name })}>
                            <Ban className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">لا توجد متاجر</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl="/admin/stores" searchParams={Object.fromEntries(sp.entries())} />
      )}

      <ConfirmDialog
        open={blockTarget !== null}
        onOpenChange={(open) => { if (!open) setBlockTarget(null); }}
        title="حظر هذا المتجر؟"
        description={`سيختفي متجر "${blockTarget?.name}" فورًا من الدليل العام ولن يتمكن متابعوه من رؤيته حتى يتم رفع الحظر.`}
        confirmLabel="حظر"
        destructive
        isPending={updateStatus.isPending}
        onConfirm={() => {
          if (!blockTarget) return;
          updateStatus.mutate(
            { storeId: blockTarget.id, status: 'BLOCKED' },
            { onSuccess: () => setBlockTarget(null) },
          );
        }}
      />
    </div>
  );
}
