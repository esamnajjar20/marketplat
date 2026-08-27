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

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldOff, ShieldCheck, BadgeCheck, BadgeX, Star, Search } from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { Badge }         from '@/components/shared/ui/Badge';
import { Input }         from '@/components/shared/ui/Input';
import { Checkbox }      from '@/components/shared/ui/Checkbox';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { BulkActionBar } from '@/components/shared/admin/BulkActionBar';
import { useAdminSellers } from '@/hooks/queries/useAdmin';
import {
  useAdminSetSellerVerified, useAdminSetSellerSuspended,
  useAdminBulkSetSellerVerified, useAdminBulkSetSellerSuspended,
} from '@/hooks/mutations/useAdminMutations';
import { formatDate } from '@/lib/formatters';
import { parseApiError } from '@/lib/errorParser';

export function AdminSellersTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  const page   = Number(sp.get('page') ?? 1);
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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, q]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((s) => s.id)));
  }

  function search(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('q', value); else params.delete('q');
    params.delete('page');
    router.push(`/admin/sellers?${params.toString()}`);
  }

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
      {/* FIX BUG-XX: see AdminUsersTable — key={q} forces a remount when
          `q` changes via browser back/forward, so the uncontrolled
          defaultValue doesn't go stale relative to the URL/results. */}
      <Input key={q} placeholder="بحث بالاسم أو البريد…" aria-label="بحث بالاسم أو البريد" defaultValue={q}
        onBlur={(e) => search(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') search((e.target as HTMLInputElement).value); }}
        className="max-w-xs" />

      <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button variant="outline" size="sm" className="h-7"
          onClick={() => bulkSetVerified.mutate(
            { sellerProfileIds: Array.from(selectedIds), verified: true },
            { onSuccess: () => setSelectedIds(new Set()) },
          )}>
          <BadgeCheck className="h-3.5 w-3.5 me-1 text-success" />توثيق المحدد
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-destructive"
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
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
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
                <tr key={seller.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.has(seller.id)}
                      onChange={() => toggleOne(seller.id)}
                      aria-label={`تحديد ${seller.displayName}`}
                    />
                  </td>
                  <td className="p-3">
                    <span className="font-medium">{seller.displayName}</span>
                    <span className="block text-xs text-muted-foreground md:hidden">{seller.user.email}</span>
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{seller.user.email}</td>
                  <td className="p-3 hidden sm:table-cell">
                    {seller.totalRatings > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                        {Number(seller.averageRating).toFixed(1)}
                        <span className="text-muted-foreground">({seller.totalRatings})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">لا يوجد تقييم</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant={seller.verified ? 'success' : 'secondary'} className="text-xs">
                      {seller.verified ? 'موثّق' : 'غير موثّق'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={seller.suspended ? 'destructive' : 'success'} className="text-xs">
                      {seller.suspended ? 'موقوف' : 'نشط'}
                    </Badge>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {formatDate(seller.createdAt)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9"
                        title={seller.verified ? 'إلغاء التوثيق' : 'توثيق البائع'}
                        aria-label={seller.verified ? `إلغاء توثيق ${seller.displayName}` : `توثيق ${seller.displayName}`}
                        disabled={pendingVerifyId === seller.id}
                        onClick={() => setVerified.mutate({ sellerProfileId: seller.id, verified: !seller.verified })}>
                        {seller.verified
                          ? <BadgeX className="h-3.5 w-3.5 text-muted-foreground" />
                          : <BadgeCheck className="h-3.5 w-3.5 text-success" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9"
                        title={seller.suspended ? 'رفع الإيقاف' : 'إيقاف البائع'}
                        aria-label={seller.suspended ? `رفع الإيقاف عن ${seller.displayName}` : `إيقاف ${seller.displayName}`}
                        disabled={pendingSuspendId === seller.id}
                        onClick={() => {
                          // Un-suspending is low-risk and reversible with
                          // one click either way, so only the
                          // suspend direction goes through the dialog.
                          if (seller.suspended) {
                            setSuspended.mutate({ sellerProfileId: seller.id, suspended: false });
                          } else {
                            setSuspendTarget({ id: seller.id, name: seller.displayName });
                          }
                        }}>
                        {seller.suspended
                          ? <ShieldCheck className="h-3.5 w-3.5 text-success" />
                          : <ShieldOff className="h-3.5 w-3.5 text-destructive" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8}><EmptyState icon={<Search className="h-8 w-8" />} title="لا يوجد بائعون" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl="/admin/sellers" searchParams={Object.fromEntries(sp.entries())} />
      )}

      <ConfirmDialog
        open={suspendTarget !== null}
        onOpenChange={(open) => { if (!open) setSuspendTarget(null); }}
        title="إيقاف هذا البائع؟"
        description={`لن يتمكن "${suspendTarget?.name}" من نشر إعلانات أو خدمات جديدة حتى يتم رفع الإيقاف عنه. إعلاناته الحالية تبقى كما هي.`}
        confirmLabel="إيقاف"
        destructive
        isPending={setSuspended.isPending}
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
}
