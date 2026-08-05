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

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldOff, ShieldCheck, BadgeCheck, BadgeX, AlertTriangle, Star } from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { Badge }         from '@/components/shared/ui/Badge';
import { Input }         from '@/components/shared/ui/Input';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAdminSellers } from '@/hooks/queries/useAdmin';
import { useAdminSetSellerVerified, useAdminSetSellerSuspended } from '@/hooks/mutations/useAdminMutations';
import { formatDate } from '@/lib/formatters';

export function AdminSellersTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  const page   = Number(sp.get('page') ?? 1);
  const q      = sp.get('q') ?? '';

  const { data, isLoading, isError, refetch } = useAdminSellers({ page, q });
  const setVerified  = useAdminSetSellerVerified();
  const setSuspended = useAdminSetSellerSuspended();

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

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  function search(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('q', value); else params.delete('q');
    params.delete('page');
    router.push(`/admin/sellers?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <Input placeholder="بحث بالاسم أو البريد…" defaultValue={q}
        onBlur={(e) => search(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') search((e.target as HTMLInputElement).value); }}
        className="max-w-xs" />

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : isError ? (
        // Same UX-FIX P1-9 reasoning as AdminUsersTable: a failed fetch
        // must not render as "لا يوجد بائعون" — that could wrongly read
        // as "the platform genuinely has no sellers."
        <div className="flex flex-col items-center gap-3 py-12 text-center rounded-lg border">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل البائعين</p>
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
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
                    <Badge variant={seller.verified ? 'default' : 'secondary'} className="text-xs">
                      {seller.verified ? 'موثّق' : 'غير موثّق'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={seller.suspended ? 'destructive' : 'default'} className="text-xs">
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
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">لا يوجد بائعون</td></tr>
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
        onConfirm={() => {
          if (!suspendTarget) return;
          setSuspended.mutate(
            { sellerProfileId: suspendTarget.id, suspended: true },
            { onSuccess: () => setSuspendTarget(null) },
          );
        }}
      />
    </div>
  );
}
