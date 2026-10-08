'use client';

/**
 * AdminSellersTable — Epic 1.1.
 *
 * The audit report's finding: verifySeller/suspendSeller were fully
 * implemented server-side (admin.routes.ts), with detailed comments
 * about being "the missing remove seller status mechanism" — but had
 * zero frontend UI. The `verified` badge shown throughout the app
 * (SellerProfileHeader, ServiceProviderHeader) could never actually be
 * set to true through any reachable path. This table is that missing
 * path. Mirrors AdminUsersTable.tsx's structure exactly: search input,
 * table, per-row action buttons, pagination, and a ConfirmDialog for
 * the destructive suspend action (verify/unverify stays a single click,
 * same as the active/inactive toggle in AdminUsersTable — suspend gets
 * a confirmation the same way promote/demote to ADMIN does).
 */

import { adminPagination } from '@/lib/adminHubTabs';
import { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldOff, ShieldCheck, BadgeCheck, BadgeX, Search } from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { Badge }         from '@/components/shared/ui/Badge';
import { Checkbox }      from '@/components/shared/ui/Checkbox';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { BulkActionBar } from '@/components/shared/admin/BulkActionBar';
import { useAdminSellers } from '@/hooks/queries/useAdmin';
import { AdminSellerRow } from '@/components/admin/AdminSellerRow';
import {
  useAdminSetSellerVerified, useAdminSetSellerSuspended,
  useAdminBulkSetSellerVerified, useAdminBulkSetSellerSuspended,
} from '@/hooks/mutations/useAdminMutations';
import { parseApiError } from '@/lib/errorParser';

export const AdminSellersTable = memo(function AdminSellersTable() {
  const sp     = useSearchParams();
  // SW-ADMIN-PAGE-NAN-01: a hand-edited URL like ?page=abc
  // gave NaN here, which was sent to the backend as
  // ?page=NaN — a guaranteed 400 for what looks like a
  // valid URL. Clamp to a positive integer, fallback 1.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  // FIX BUG-02: same root cause as AdminUsersTable/AdminAdsTable —
  // '' passed to useAdminSellers serialises as a real `?q=` on the
  // wire, which adminGetSellersSchema's z.string().min(1).optional()
  // rejects as a 400 (min(1) fails on '', and .optional() only
  // accepts undefined, not an empty string). q itself stays '' for
  // the Input defaultValue below.
  const q      = sp.get('q') ?? '';
  const VERIFICATION_VALUES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
  type VerificationFilter = (typeof VERIFICATION_VALUES)[number] | 'ALL';
  const verificationParam = sp.get('verification') ?? 'ALL';
  const verification: VerificationFilter =
    verificationParam === 'ALL' ||
    (VERIFICATION_VALUES as readonly string[]).includes(verificationParam)
      ? (verificationParam as VerificationFilter)
      : 'ALL';

  const { data, isLoading, isError, error, refetch } = useAdminSellers({ page, q: q || undefined, verificationStatus: verification === 'ALL' ? undefined : verification });
  const setVerified  = useAdminSetSellerVerified();
  const setSuspended = useAdminSetSellerSuspended();
  const bulkSetVerified  = useAdminBulkSetSellerVerified();
  const bulkSetSuspended = useAdminBulkSetSellerSuspended();

  // Same reasoning as AdminUsersTable's pendingStatusUserId: disable
  // only the row whose mutation is actually in flight, not the whole
  // table, so a slow network on one row doesn't freeze every button.
  const pendingVerifyId  = setVerified.isPending  ? setVerified.variables?.sellerProfileId  : undefined;
  const pendingSuspendId = setSuspended.isPending ? setSuspended.variables?.sellerProfileId : undefined;

  // Suspending a seller immediately blocks them from publishing new
  // ads (ads.service.ts's ensureSellerProfileForAdCreation) and hides
  // their "verified" credibility everywhere it's shown — a
  // consequential action, so it goes through an explicit confirmation
  // step rather than firing on a single click. Un-suspending doesn't
  // need the same friction.
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);

  const items      = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  // BULK-ADMIN (item 17): every row is selectable here — unlike
  // AdminUsersTable there's no per-row rank gate on seller actions.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Verify/unverify is a single reversible click on each row, so the
  // bulk equivalent skips a confirm dialog too. Suspend mirrors the
  // single-row flow: un-suspending fires immediately, suspending goes
  // through ConfirmDialog.
  const [bulkSuspendConfirmOpen, setBulkSuspendConfirmOpen] = useState(false);

  const allSelected = items.length > 0 && items.every((s) => selectedIds.has(s.id));

  // SW-FIX-SELLERS-SELECT-DEPS: `verification` was missing — switching
  // tabs left stale selections whose rows weren't on screen.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, q, verification]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((s) => s.id)));
  }

  const setVerifiedForRow = useCallback((sellerProfileId: string, verified: boolean) => {
    setVerified.mutate({ sellerProfileId, verified });
  }, [setVerified]);
  const setSuspendedForRow = useCallback((sellerProfileId: string, suspended: boolean) => {
    setSuspended.mutate({ sellerProfileId, suspended });
  }, [setSuspended]);

  return (
    <div className="space-y-4">
      <AdminFilterBar
        searchParam="q"
        searchPlaceholder="بحث عن بائع…"
        tabParam="verification"
        defaultTab="ALL"
        tabs={[
          { value: 'ALL', label: 'الكل' },
          { value: 'PENDING', label: 'بانتظار التحقق' },
          { value: 'VERIFIED', label: 'موثّق' },
          { value: 'UNVERIFIED', label: 'غير موثّق' },
          { value: 'REJECTED', label: 'مرفوض' },
        ]}
      />
      {/* SW-FIX-SELLERS-DUP-SEARCH: a standalone <Input> sat right below
          AdminFilterBar's own debounced search box, both writing to the
          same `q` param — visually two search fields, functionally
          redundant. AdminFilterBar owns search now. */}
      <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button variant="outline" size="sm" className="h-7"
          disabled={bulkSetVerified.isPending}
          onClick={() => bulkSetVerified.mutate(
            { sellerProfileIds: Array.from(selectedIds), verified: true },
            { onSuccess: () => setSelectedIds(new Set()) },
          )}>
          <BadgeCheck className="h-3.5 w-3.5 me-1 text-success" />توثيق المحدد
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-destructive"
          disabled={bulkSetSuspended.isPending}
          onClick={() => setBulkSuspendConfirmOpen(true)}>
          <ShieldOff className="h-3.5 w-3.5 me-1" />إيقاف المحدد
        </Button>
      </BulkActionBar>

      {isLoading ? (
        // FIX AUDIT-1: TableSkeleton instead of a centered LoadingSpinner
        // on refetch — see AdminAdsTable for the full rationale.
        <TableSkeleton columns={8} />
      ) : isError ? (
        // Same UX-FIX P1-9 reasoning as AdminUsersTable: a failed fetch
        // must not render as "لا يوجد بائعون" — that could wrongly read
        // as "the platform genuinely has no sellers."
        // FIX AUDIT-1: shared ApiError instead of a hand-rolled block —
        // see AdminAdsTable for the full rationale.
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      ) : (
        <>
        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {items.map((seller) => (
            <div key={seller.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={selectedIds.has(seller.id)}
                  onChange={() => toggleOne(seller.id)}
                  aria-label={`تحديد ${seller.displayName}`}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold leading-snug">{seller.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{seller.user.email}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={seller.verified ? 'success' : 'secondary'} className="text-xs">
                      {seller.verified ? 'موثّق' : 'غير موثّق'}
                    </Badge>
                    <Badge variant={seller.suspended ? 'destructive' : 'success'} className="text-xs">
                      {seller.suspended ? 'موقوف' : 'نشط'}
                    </Badge>
                  </div>
                </div>
              </div>
              {/* SW-FIX-MOBILE-SELLERS-ACTIONS: mobile parity with the
                  desktop table — same verify/suspend actions, same
                  pendingVerifyId/pendingSuspendId gating, same
                  suspendTarget ConfirmDialog. An admin on a phone could
                  only view the row before this. */}
              <div className="mt-2 flex justify-end gap-1 border-t border-border/60 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  aria-label={seller.verified ? `إلغاء توثيق ${seller.displayName}` : `توثيق ${seller.displayName}`}
                  disabled={pendingVerifyId === seller.id}
                  onClick={() => setVerified.mutate({ sellerProfileId: seller.id, verified: !seller.verified })}
                >
                  {seller.verified
                    ? <BadgeX className="h-3.5 w-3.5 text-muted-foreground" />
                    : <BadgeCheck className="h-3.5 w-3.5 text-success" />}
                  {seller.verified ? 'إلغاء التوثيق' : 'توثيق'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={seller.suspended ? 'h-8 gap-1 text-xs' : 'h-8 gap-1 text-xs text-destructive hover:text-destructive'}
                  aria-label={seller.suspended ? `رفع الإيقاف عن ${seller.displayName}` : `إيقاف ${seller.displayName}`}
                  disabled={pendingSuspendId === seller.id}
                  onClick={() => {
                    if (seller.suspended) {
                      setSuspended.mutate({ sellerProfileId: seller.id, suspended: false });
                    } else {
                      setSuspendTarget({ id: seller.id, name: seller.displayName });
                    }
                  }}
                >
                  {seller.suspended
                    ? <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    : <ShieldOff className="h-3.5 w-3.5" />}
                  {seller.suspended ? 'رفع الإيقاف' : 'إيقاف'}
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <EmptyState icon={<Search className="h-8 w-8" />} title="لا يوجد بائعون" />
          )}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[640px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 p-3">
                  {items.length > 0 && (
                    <Checkbox checked={allSelected} onChange={toggleAll} aria-label="تحديد كل البائعين" />
                  )}
                </th>
                <th className="text-start p-3 font-medium">البائع</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">البريد</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">التقييم</th>
                <th className="text-start p-3 font-medium">التوثيق</th>
                <th className="text-start p-3 font-medium">الحالة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">تاريخ الانضمام</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((seller) => (
                <AdminSellerRow
                  key={seller.id}
                  seller={seller}
                  selected={selectedIds.has(seller.id)}
                  pendingVerifyId={pendingVerifyId}
                  pendingSuspendId={pendingSuspendId}
                  onToggle={toggleOne}
                  onSetVerified={setVerifiedForRow}
                  onSetSuspended={setSuspendedForRow}
                  onSuspendRequest={(id, name) => setSuspendTarget({ id, name })}
                />
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8}><EmptyState icon={<Search className="h-8 w-8" />} title="لا يوجد بائعون" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          {...adminPagination('sellers', sp)} />
      )}

      <ConfirmDialog
        open={suspendTarget !== null}
        onOpenChange={(open) => { if (!open) setSuspendTarget(null); }}
        title="إيقاف هذا البائع؟"
        description={`لن يتمكن "${suspendTarget?.name}" من نشر إعلانات أو خدمات جديدة حتى يتم رفع الإيقاف عنه. إعلاناته الحالية تبقى كما هي.`}
        confirmLabel="إيقاف"
        destructive
        // SW-FIX-SELLER-CONFIRM-PENDING: only disable the confirm button
        // when THIS target is the one whose mutation is in flight, not
        // whenever any seller mutation is pending.
        isPending={setSuspended.isPending && pendingSuspendId === suspendTarget?.id}
        requireReason
        onConfirm={() => {}}
        onConfirmWithReason={(reason) => {
          if (!suspendTarget) return;
          setSuspended.mutate(
            { sellerProfileId: suspendTarget.id, suspended: true, reason },
            { onSuccess: () => setSuspendTarget(null) },
          );
        }}
      />

      {/* BULK-ADMIN (item 17): separate dialog/state from the
          single-row suspend above — same reasoning as
          AdminReportsTable/AdminAdsTable's bulk ConfirmDialogs. */}
      <ConfirmDialog
        open={bulkSuspendConfirmOpen}
        onOpenChange={setBulkSuspendConfirmOpen}
        title={`إيقاف ${selectedIds.size} بائع؟`}
        description="لن يتمكنوا من نشر إعلانات أو خدمات جديدة حتى يتم رفع الإيقاف عنهم. إعلاناتهم الحالية تبقى كما هي."
        confirmLabel="إيقاف"
        destructive
        isPending={bulkSetSuspended.isPending}
        requireReason
        onConfirm={() => {}}
        onConfirmWithReason={(reason) => {
          bulkSetSuspended.mutate(
            { sellerProfileIds: Array.from(selectedIds), suspended: true, reason },
            {
              onSuccess: () => {
                setSelectedIds(new Set());
                setBulkSuspendConfirmOpen(false);
              },
            },
          );
        }}
      />
    </div>
  );
});
