'use client';

import { OfflineFreshnessBadge } from '@/components/offline/OfflineFreshnessBadge';

/**
 * مركز المزامنة — يعرض:
 * - عمليات بانتظار الإرسال العامة (pending / failed)
 * - مسودات الإعلانات المحلية
 * - زر مزامنة الآن
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, Trash2, AlertCircle, CheckCircle2, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuthStore, selectUser } from '@/store/auth.store';
import {
  getQueuedRequestCounts,
  listFailedRequests,
  retryFailedRequest,
  discardFailedRequest,
  retryQueuedOperation,
  cancelQueuedOperation,
  requestQueueReplay,
  isConflictFailure,
  describeQueueFailure,
  queueFailureAction,
  type QueuedRequestSummary,
} from '@/lib/offlineQueue';
import { syncPendingOfflineDrafts } from '@/lib/offlineDraftPublisher';
import { toastDraftPublishResult, toastSyncStarted } from '@/lib/offlinePublishFeedback';
import {
  listAdDrafts,
  deleteAdDraft,
  cancelAdDraftSync,
  saveAdDraft,
  draftDisplayTitle,
  draftKindLabel,
  type AdDraft,
  type AdDraftPreviewImage,
} from '@/lib/offlineAdDrafts';
import { resumeHrefForDraft } from '@/lib/offlineDraftResume';
import { getErrorMessage } from '@/lib/i18n/ar/errors';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { listSalesDrafts, type SalesOfflineDraft } from '@/lib/sales-offline/salesDraftStore';
import { resolveSalesConflict } from '@/lib/sales-offline/salesSync';

export function SyncCenterClient() {
  const isOnline = useOnlineStatus();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [failedItems, setFailedItems] = useState<QueuedRequestSummary[]>([]);
  const [drafts, setDrafts] = useState<AdDraft[]>([]);
  const [salesDrafts, setSalesDrafts] = useState<SalesOfflineDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [counts, failedList, draftList, salesList] = await Promise.all([
        getQueuedRequestCounts().catch(() => ({ pending: 0, failed: 0 })),
        listFailedRequests().catch(() => [] as QueuedRequestSummary[]),
        // FIX AD-DRAFT-USER-SCOPE-01: مسودات صاحب الحساب الحالي فقط —
        // بدونها، مسودة حساب سابق على نفس الجهاز تظهر لحساب جديد.
        listAdDrafts(userId).catch(() => [] as AdDraft[]),
        listSalesDrafts(userId).catch(() => [] as SalesOfflineDraft[]),
      ]);
      setPending(counts.pending);
      setFailed(counts.failed);
      setFailedItems(failedList);
      setDrafts(draftList);
      setSalesDrafts(salesList);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, isOnline]);

  async function handleSyncNow() {
    if (!isOnline) {
      toast.error('لا يوجد اتصال — لا يمكن المزامنة الآن');
      return;
    }
    setSyncing(true);
    try {
      toastSyncStarted();
      await requestQueueReplay();
      // FIX OFFLINE-DRAFT-PUBLISH-01: ارفع المسودات المحلية أيضًا
      const draftResult = await syncPendingOfflineDrafts({
        userId,
        includeFailed: true,
      });
      if (draftResult.sent > 0 || draftResult.failed > 0) {
        toastDraftPublishResult(draftResult);
      } else if (draftResult.skipped > 0) {
        toast.message('الطلبات في طابور الإرسال', {
          description:
            `${draftResult.skipped} عنصر مربوط بطابور الإرسال وسيُرسل تلقائيًا. ` +
            `إذا بقيت معلّقة أكثر من دقيقة، سيتولى الرفع من المسودة تلقائيًا.`,
          duration: 8000,
        });
      } else {
        toast.success('تمت المزامنة', {
          description: 'لا توجد مسودات أو طلبات معلّقة.',
          duration: 5000,
        });
      }
      window.setTimeout(() => void refresh(), 1500);
    } catch {
      toast.error('تعذّر بدء المزامنة');
    } finally {
      setSyncing(false);
    }
  }

  async function handleRetry(id: number) {
    try {
      // FIX N6: retryFailedRequest is fire-and-forget to the SW; it does
      // not throw on "no SW / unknown id / still deferred". Delay the
      // refresh so the SW has a moment to process, and use a neutral
      // toast rather than claiming success unconditionally.
      await retryFailedRequest(id);
      toast.message('جاري إعادة المحاولة…');
      window.setTimeout(() => void refresh(), 800);
    } catch {
      toast.error('تعذّرت إعادة المحاولة');
    }
  }

  async function handleDiscard(id: number, operationId?: string | null) {
    try {
      if (operationId) {
        await cancelQueuedOperation(operationId);
        toast.message('تم إيقاف الإرسال', { description: 'بقي المحتوى محفوظًا في المسودة ولن يُرسل تلقائيًا.' });
      } else {
        await discardFailedRequest(id);
        toast.message('تم إلغاء الطلب');
      }
      await refresh();
    } catch {
      toast.error('تعذّر إيقاف الإرسال');
    }
  }

  async function handleRetryDraft(draft: AdDraft) {
    try {
      await saveAdDraft({
        ...draft,
        status: 'pending_sync',
        lastError: undefined,
        lastErrorCode: undefined,
        lastErrorStatus: undefined,
        publishRetryCount: 0,
      });
      if (draft.operationId) {
        const ownedByQueue = await retryQueuedOperation(draft.operationId);
        if (ownedByQueue) {
          await requestQueueReplay();
        } else {
          // No live SW queue owns this operation, so the local draft publisher
          // is the single fallback sender. This avoids duplicate sends.
          await syncPendingOfflineDrafts({ userId, includeFailed: true });
        }
      } else {
        await syncPendingOfflineDrafts({ userId, includeFailed: true });
      }
      toast.message('أُعيدت المحاولة', { description: 'سيُرسل المحتوى الآن. لن تُفقد المسودة إذا فشل الإرسال مرة أخرى.' });
      await refresh();
    } catch {
      toast.error('تعذّرت إعادة المحاولة');
    }
  }

  async function handleCancelDraftSync(draft: AdDraft) {
    try {
      if (draft.operationId) await cancelQueuedOperation(draft.operationId);
      await cancelAdDraftSync(draft.id);
      toast.message('تم إيقاف الإرسال', { description: 'بقي المحتوى محفوظًا كمسودة ويمكنك تعديله أو إرساله لاحقًا.' });
      await refresh();
    } catch {
      toast.error('تعذّر إيقاف الإرسال');
    }
  }

  async function handleDeleteDraft(id: string) {
    try {
      await deleteAdDraft(id);
      toast.success('حُذفت المسودة');
      await refresh();
    } catch {
      toast.error('تعذّر حذف المسودة');
    }
  }

  const lastLabel = isOnline ? 'متصل' : 'غير متصل';

  return (
    <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-6 px-1 py-2">
      <div>
        <h1 className="text-xl font-bold">المزامنة</h1>
        {!isOnline ? (
          <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-strong dark:text-warning">
            أنت غير متصل الآن. عند عودة الإنترنت ستُرفع العناصر المعلّقة تلقائيًا،
            أو اضغط «مزامنة الآن» بعد الاتصال.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            اضغط «مزامنة الآن» لإرسال الطلبات المعلّقة والمسودات المحلية فورًا.
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة العمليات والمسودات التي تنتظر الاتصال. الحالة الآن: {lastLabel}
        </p>
        {drafts[0]?.updatedAt ? (
          <OfflineFreshnessBadge
            className="mt-1"
            savedAt={drafts[0].updatedAt}
            kind="list"
            hideWhenFresh={false}
          />
        ) : null}
      </div>

      {/*
        FIX AD-DRAFT-QUEUE-DOUBLECOUNT-01: مسودة بحالة pending_sync/failed
        لها operationId مرتبط بعنصر طابور فعلي — pending/failed أعلاه (من
        getQueuedRequestCounts) تحتسبها أصلًا. عدّها هنا مرة ثانية كان
        يُظهر "عنصرين بالانتظار" لعملية نشر إعلان واحدة. فقط مسودات
        status:'draft' (لا operationId — لم تُحاول الإرسال أصلًا بعد) تُضاف
        هنا كعدد إضافي حقيقي غير مُحتسَب بمكان آخر.
      */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<RefreshCw className="h-4 w-4" />}
          label="في الطابور"
          value={loading ? '…' : String(Math.max(0, pending))}
          hint="سيُرسل تلقائيًا"
        />
        <StatCard
          icon={<FileText className="h-4 w-4 text-primary" />}
          label="مسودات"
          value={
            loading
              ? '…'
              : String(drafts.filter((d) => !d.operationId && d.status !== 'failed').length)
          }
          hint="لم تبدأ المزامنة بعد"
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4 text-destructive" />}
          label="تحتاج انتباهًا"
          value={
            loading
              ? '…'
              : String(failed + drafts.filter((d) => !d.operationId && d.status === 'failed').length)
          }
          hint="مراجعة أو إعادة محاولة"
          tone="danger"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void handleSyncNow()} disabled={syncing || !isOnline}>
          <RefreshCw className={`me-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          مزامنة الآن
        </Button>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          تحديث القائمة
        </Button>
        <Button variant="ghost" asChild>
          <Link href={ROUTES.offline.storage}>التخزين والبيانات</Link>
        </Button>
        {/* DRAFTS-LINKS-01 */}
        <Button variant="ghost" asChild>
          <Link href={ROUTES.offline.drafts}>مركز المسودات</Link>
        </Button>
      </div>

      {/* مسودات محفوظة محليًا (إعلان / منتج / خدمة) */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <FileText className="h-4 w-4" />
          مسودات محفوظة محليًا
        </h2>
        {drafts.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/70" />
            <p className="mt-2 text-sm font-medium">لا توجد مسودات محفوظة محليًا</p>
            <p className="mt-1 text-xs text-muted-foreground">ستظهر هنا المسودات التي تبدأها أثناء انقطاع الاتصال.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {draftDisplayTitle(d)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {draftKindLabel(d.kind)} · {d.mode === 'create' ? 'إنشاء' : 'تعديل'} ·{' '}
                    {statusLabel(d.status)} · {formatWhen(d.updatedAt)}
                    {/* FIX DRAFT-LABEL-HONEST-01: the old single
                        condition (operationId present?) lied in the
                        one case that matters most — a draft the
                        Publisher gave up on (status='failed',
                        publishRetryCount at the cap) still has its
                        operationId attached (needed for the
                        LINK side of the story), so it kept reading
                        "في طابور الإرسال" while the pill right above
                        it said "فشل الرفع". Show exactly one of the
                        two states. */}
                    {d.status === 'failed'
                      ? ' · يحتاج مراجعة يدوية'
                      : d.operationId
                        ? ' · في طابور الإرسال'
                        : ''}
                  </p>
                  {/* FIX IMAGEOFFLINE-WIRE-01: معاينة مضغوطة فقط — الصور
                      الفعلية بجودتها الكاملة تُرسَل عبر طابور الـ SW. */}
                  {d.images && d.images.length > 0 ? <DraftThumbnails images={d.images} /> : null}
                  {d.lastError ? (
                    <p className="mt-1 text-xs text-destructive">
                      {/* FIX LASTERROR-CODE-01: prefer a fresh translation
                          from the stored code so an i18n change actually
                          reaches existing drafts. Falls back to the frozen
                          `lastError` string for legacy drafts written
                          before the code fields existed, and for codes
                          missing from the dictionary. */}
                      {d.lastErrorCode
                        ? getErrorMessage(d.lastErrorCode) ?? d.lastError
                        : d.lastError}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={resumeHrefForDraft(d)}>
                      <Pencil className="me-1 h-3.5 w-3.5" />
                      تعديل
                    </Link>
                  </Button>
                  {d.status === 'failed' ? (
                    <>
                      <Button size="sm" onClick={() => void handleRetryDraft(d)} disabled={!isOnline}>
                        <RefreshCw className="me-1 h-3.5 w-3.5" />
                        إعادة المحاولة
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleCancelDraftSync(d)}>
                        إيقاف الإرسال
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف المسودة نهائيًا"
                    onClick={() => void handleDeleteDraft(d.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          عند انقطاع النت تُحفظ المسودة (إعلان / منتج / خدمة / طلب) مع الصور إن وُجدت،
          وتُرفع تلقائيًا عند عودة الاتصال أو عبر «مزامنة الآن». استخدم «متابعة» إن فشل
          الرفع وتحتاج تعديل البيانات يدويًا.
        </p>
      </section>

      {/* فشل الطابور */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">طلبات فاشلة</h2>
        {failedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-7 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success/80" />
            <p className="mt-2 text-sm font-medium">لا توجد طلبات فاشلة</p>
            <p className="mt-1 text-xs text-muted-foreground">كل ما فشل سيظهر هنا مع خيار المراجعة أو إعادة المحاولة.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {failedItems.map((item) => {
              const action = queueFailureAction(item);
              const conflict = isConflictFailure(item);
              return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {item.method} {shortUrl(item.url)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {describeQueueFailure(item)}
                  </p>
                  {item.operationId ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      المحتوى المرتبط بهذه العملية محفوظ أيضًا كمسودة، ويمكنك تعديله من قسم المسودات أعلاه.
                    </p>
                  ) : null}
                  {conflict ? (
                    <p className="mt-1 text-xs text-warning-strong dark:text-warning">
                      {action === 'edit'
                        ? 'عدّل المصدر ثم أعد الإرسال أونلاين — لا تُعد المحاولة العمياء.'
                        : action === 'discard'
                          ? 'العنصر لم يعد صالحًا — احذف الطلب من الطابور.'
                          : 'تعارض: راجع البيانات قبل إعادة المحاولة.'}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  {action === 'retry' || action === 'edit' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isOnline || (conflict && action !== 'retry')}
                      onClick={() => void handleRetry(item.id)}
                      title={
                        conflict && action !== 'retry'
                          ? 'التعارض يحتاج مراجعة يدوية'
                          : 'إعادة المحاولة'
                      }
                    >
                      {conflict && action !== 'retry' ? 'تعارض' : 'إعادة'}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => void handleDiscard(item.id, item.operationId)}>
                    إلغاء الطلب
                  </Button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {salesDrafts.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
          <div>
            <h2 className="font-semibold">مبيعات محفوظة أوفلاين</h2>
            <p className="mt-1 text-sm text-muted-foreground">المبيعات لا تُكرر عند المزامنة؛ لكل عملية معرّف يمنع تسجيلها مرتين.</p>
          </div>
          <ul className="space-y-2">
            {salesDrafts.map((draft) => {
              const conflict = draft.status === 'conflict';
              return (
                <li key={draft.operationId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{draft.payload.entityTitle || 'بيع'}</p>
                    <p className="text-xs text-muted-foreground">{draft.payload.quantity} × {draft.payload.unitPrice} ₪ · {conflict ? 'تعارض يحتاج مراجعة' : 'بانتظار المزامنة'}</p>
                    {draft.lastError?.message ? <p className="mt-1 text-xs text-destructive">{draft.lastError.message}</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={!isOnline} onClick={() => void resolveSalesConflict(draft.operationId, 'retry').then(() => refresh())}>إعادة المحاولة</Button>
                    <Button size="sm" variant="ghost" onClick={() => void resolveSalesConflict(draft.operationId, 'discard').then(() => refresh())}>حذف المسودة</Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">في تعارض المخزون أو رقم العملية لا نُنشئ بيعًا ثانيًا تلقائيًا؛ راجع العملية ثم أعد إرسالها بنفس المعرّف.</p>
        </section>
      ) : null}

      {pending > 0 && (
        <p className="text-sm text-muted-foreground">
          يوجد {pending} طلبًا معلّقًا سيُرسل تلقائيًا عند توفر الاتصال (أو عبر «مزامنة الآن»).
        </p>
      )}
    </div>
  );
}

/**
 * FIX IMAGEOFFLINE-WIRE-01: يعرض نسخ المعاينة المضغوطة (lib/imageOffline.ts)
 * كصور مصغّرة. object URLs تُنشأ وتُلغى محليًا لكل تغيير بقائمة الصور —
 * بلا هذا التنظيف تتسرّب object URLs مع كل إعادة عرض.
 */
function DraftThumbnails({ images }: { images: AdDraftPreviewImage[] }) {
  const urls = useMemo(() => images.map((img) => URL.createObjectURL(img.blob)), [images]);
  useEffect(() => {
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [urls]);

  return (
    <div className="mt-1.5 flex gap-1.5">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- object URL محلي، لا يستفيد من next/image
        <img key={u} src={u} alt={images[i]?.name ?? "صورة"} className="h-10 w-10 rounded-md border object-cover" />
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className={cn(
      'rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm',
      tone === 'danger' && 'border-destructive/25 bg-destructive/[0.03]',
    )}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/70">{icon}</span>
        <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      </div>
      <p className="mt-3 text-sm font-semibold">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function statusLabel(s: AdDraft['status']): string {
  switch (s) {
    case 'draft':
      return 'مسودة';
    case 'pending_sync':
      return 'بانتظار الرفع';
    case 'failed':
      return 'فشل الرفع';
    case 'synced':
      return 'متزامن';
    default:
      return s;
  }
}

// SW-FIX-SCC-DEAD-CATCH: toLocaleString never throws on an invalid date
// (returns "Invalid Date" string instead). Removed the dead try/catch.
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('ar');
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, 'https://local');
    return u.pathname;
  } catch {
    return url.slice(0, 48);
  }
}
