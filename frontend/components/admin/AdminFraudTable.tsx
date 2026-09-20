// FIX FRAUD-FRAGMENT-KEY-01: the row + its expandable signals row were
// wrapped in a keyless Fragment, so React saw an array of unkeyed
// same-shaped elements.
'use client';

/**
 * FRAUD-UI: /admin/fraud/* (fraud.service.ts / fraud.repository.ts /
 * fraud.routes.ts) shipped as a complete backend module — automatic
 * scoring on every new ad (ads.service.ts's createAd), an admin review
 * queue endpoint, manual flagging, and signal-review endpoints — with
 * no frontend caller anywhere. riskScore and flaggedForReview were
 * being computed and persisted on every ad with no reachable screen to
 * see or act on them. This wires the queue up, mirroring
 * AdminReportsTable's structure (status filter → table → row actions →
 * ConfirmDialog) since a fraud queue and a reports queue are the same
 * shape of moderation work.
 *
 * Known gap this table does NOT close on its own: automatic scoring
 * only fires from ads.service.ts (createAd and, after FIX
 * FRAUD-GAP-01, updateAd for fraud-relevant field edits). This table
 * is purely the review/action surface for whatever those two paths
 * produce — it doesn't trigger scoring itself.
 */

import { Fragment, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ExternalLink, ChevronDown, ChevronUp, ShieldCheck, Flag as FlagIcon } from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { Badge }         from '@/components/shared/ui/Badge';
import { Input }         from '@/components/shared/ui/Input';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError }      from '@/components/shared/ApiError';
import { EmptyState }    from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/shared/ui/Dialog';
import { useAdminFlaggedAds, useAdminFraudSignals } from '@/hooks/queries/useAdmin';
import {
  useAdminClearFraudFlag,
  useAdminManualFraudFlag,
  useAdminReviewFraudSignal,
} from '@/hooks/mutations/useAdminMutations';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime, formatPrice } from '@/lib/formatters';
import { parseApiError } from '@/lib/errorParser';
import type { FraudSignalType } from '@/types/admin.types';

// Backend Prisma enum FraudSignalType (schema.prisma) — see
// fraud.service.ts's computeSignals for what triggers each one.
const SIGNAL_TYPE_LABELS: Record<FraudSignalType, string> = {
  RAPID_POSTING:              'نشر متسارع',
  SUSPICIOUS_PRICE:           'سعر مشبوه',
  SUSPICIOUS_CONTACT_PATTERN: 'نمط تواصل مشبوه',
  SUSPICIOUS_KEYWORDS:        'كلمات مشبوهة',
  DUPLICATE_LISTING:          'إعلان مكرر',
  NEW_ACCOUNT_HIGH_ACTIVITY:  'حساب جديد بنشاط مرتفع',
  MANUAL_ADMIN_FLAG:          'علامة يدوية من الإدارة',
};

function riskBadgeVariant(riskScore: number): 'destructive' | 'outline' | 'secondary' {
  if (riskScore >= 70) return 'destructive';
  if (riskScore >= 40) return 'secondary';
  return 'outline';
}

/** Expandable signal list for one flagged ad — fetched on demand when the row is opened. */
function AdSignalsPanel({ adId }: { adId: string }) {
  const { data, isLoading, isError, error, refetch } = useAdminFraudSignals({ adId, limit: 20 });
  const reviewSignal = useAdminReviewFraudSignal();

  if (isLoading) return <div className="p-3 text-xs text-muted-foreground">جارِ التحميل…</div>;
  if (isError) {
    return (
      <div className="p-3">
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      </div>
    );
  }

  const signals = data?.items ?? [];
  if (signals.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">لا توجد إشارات مسجّلة لهذا الإعلان.</div>;
  }

  return (
    <div className="p-3 space-y-2">
      {signals.map((signal) => (
        <div key={signal.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-xs shrink-0">
              {SIGNAL_TYPE_LABELS[signal.type] ?? signal.type}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">وزن {signal.weight}</span>
            <span className="text-xs text-muted-foreground truncate">{formatRelativeTime(signal.createdAt)}</span>
          </div>
          {signal.reviewed ? (
            <Badge variant="outline" className="text-xs text-success shrink-0">تمت المراجعة</Badge>
          ) : (
            <Button
              variant="ghost" size="sm" className="h-7 shrink-0"
              disabled={reviewSignal.isPending && reviewSignal.variables === signal.id}
              onClick={() => reviewSignal.mutate(signal.id)}
            >
              <ShieldCheck className="h-3.5 w-3.5 me-1" />تأكيد المراجعة
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function AdminFraudTable() {
  const sp     = useSearchParams();
  // URL `?reviewed=false` is reserved for ops-queue deep links; wire when
  // the fraud list API supports a reviewed filter server-side.
  void sp.get('reviewed');
  const page   = Number(sp.get('page') ?? 1);

  const { data, isLoading, isError, error, refetch } = useAdminFlaggedAds({ page });
  const clearFlag   = useAdminClearFraudFlag();
  const manualFlag  = useAdminManualFraudFlag();

  const items      = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearTargetId, setClearTargetId] = useState<string | null>(null);
  const [flagTargetId, setFlagTargetId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState('');

  function closeFlagDialog() {
    setFlagTargetId(null);
    setFlagReason('');
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <TableSkeleton columns={5} />
      ) : isError ? (
        // Same reasoning as AdminReportsTable's UX-FIX P1-9: a failed
        // fetch must not render as "no flagged ads" — an admin could
        // wrongly conclude the queue is genuinely clear.
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      ) : (
        <>
        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {items.map((ad) => (
            <div key={ad.id} className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-xs">
              <div className="min-w-0 space-y-1">
                <Link href={ROUTES.adDetail(ad.id)} target="_blank" className="text-sm font-semibold text-primary hover:underline line-clamp-2">
                  {ad.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-primary">{formatPrice(ad.price)}</span>
                  <span>{ad.user?.name ?? '—'}</span>
                  <Badge variant={riskBadgeVariant(ad.riskScore)} className="text-xs">{ad.riskScore}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{formatRelativeTime(ad.createdAt)}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1 border-t border-border/60 pt-2">
                <Button type="button" size="sm" variant="ghost" className="h-8"
                  onClick={() => setExpandedId(expandedId === ad.id ? null : ad.id)}>
                  {expandedId === ad.id ? 'إخفاء' : 'إشارات'}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setFlagTargetId(ad.id)}>
                  وسم
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8"
                  disabled={clearFlag.isPending && clearFlag.variables === ad.id}
                  onClick={() => setClearTargetId(ad.id)}>
                  سليم
                </Button>
              </div>
              {expandedId === ad.id && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                  <AdSignalsPanel adId={ad.id} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[640px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-3 font-medium">الإعلان</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">صاحب الإعلان</th>
                <th className="text-start p-3 font-medium">درجة الخطورة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">التاريخ</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((ad) => (
                <Fragment key={ad.id}>
                  <tr className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 max-w-xs">
                      <Link href={ROUTES.adDetail(ad.id)} target="_blank"
                        className="flex items-center gap-1 text-primary hover:underline text-xs">
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{ad.title}</span>
                      </Link>
                      <span className="text-xs text-muted-foreground">{formatPrice(ad.price)}</span>
                    </td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">
                      {ad.user?.name ?? '—'}
                    </td>
                    <td className="p-3">
                      <Badge variant={riskBadgeVariant(ad.riskScore)} className="text-xs">
                        {ad.riskScore}
                      </Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {formatRelativeTime(ad.createdAt)}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7"
                          onClick={() => setExpandedId(expandedId === ad.id ? null : ad.id)}>
                          {expandedId === ad.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          الإشارات
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7"
                          onClick={() => setFlagTargetId(ad.id)}>
                          <FlagIcon className="h-3.5 w-3.5 me-1" />علامة يدوية
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-success"
                          disabled={clearFlag.isPending && clearFlag.variables === ad.id}
                          onClick={() => setClearTargetId(ad.id)}>
                          <ShieldCheck className="h-3.5 w-3.5 me-1" />إعلان سليم
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === ad.id && (
                    <tr className="bg-muted/20">
                      <td colSpan={5} className="p-0">
                        <AdSignalsPanel adId={ad.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5}>
                  <EmptyState icon={<AlertTriangle className="h-8 w-8" />} title="لا توجد إعلانات موسومة حالياً" />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl="/admin/fraud" searchParams={Object.fromEntries(sp.entries())} />
      )}

      <ConfirmDialog
        open={clearTargetId !== null}
        onOpenChange={(open) => { if (!open) setClearTargetId(null); }}
        title="اعتبار هذا الإعلان سليماً؟"
        description="سيُزال هذا الإعلان من قائمة المراجعة. سجل الإشارات السابقة يبقى محفوظاً."
        confirmLabel="تأكيد"
        isPending={clearFlag.isPending}
        onConfirm={() => {
          if (!clearTargetId) return;
          clearFlag.mutate(clearTargetId, { onSuccess: () => setClearTargetId(null) });
        }}
      />

      <Dialog open={flagTargetId !== null} onOpenChange={(open) => { if (!open) closeFlagDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>وضع علامة احتيال يدوية</DialogTitle>
            <DialogDescription>
              يُستخدم هذا عند ملاحظة نمط مشبوه لا تغطيه القواعد التلقائية — مثلاً من خلال مراجعة البلاغات.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="سبب وضع العلامة"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeFlagDialog}>إلغاء</Button>
            <Button
              disabled={!flagReason.trim() || manualFlag.isPending}
              onClick={() => {
                if (!flagTargetId || !flagReason.trim()) return;
                manualFlag.mutate(
                  { adId: flagTargetId, payload: { reason: flagReason.trim() } },
                  { onSuccess: () => closeFlagDialog() },
                );
              }}
            >
              {manualFlag.isPending ? 'جارِ الحفظ…' : 'وضع العلامة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
