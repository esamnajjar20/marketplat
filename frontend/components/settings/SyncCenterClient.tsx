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
import { appointmentsApi } from '@/api/appointments.api';
import { deleteOfflineAppointmentDraft, listOfflineAppointmentDrafts, updateOfflineAppointmentDraft, type OfflineAppointmentDraft } from '@/lib/offlineAppointmentDrafts';
import { listOfflineFavoriteIntents, removeOfflineFavoriteIntent, syncOfflineFavoriteIntents, type OfflineFavoriteIntent } from '@/lib/offlineFavoriteIntents';

export function SyncCenterClient() {
  const isOnline = useOnlineStatus();
  const userId = useAuthStore(selectUser)?.id ?? null;
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [failedItems, setFailedItems] = useState<QueuedRequestSummary[]>([]);
  const [drafts, setDrafts] = useState<AdDraft[]>([]);
  const [salesDrafts, setSalesDrafts] = useState<SalesOfflineDraft[]>([]);
  const [appointmentDrafts, setAppointmentDrafts] = useState<OfflineAppointmentDraft[]>([]);
  const [favoriteIntents, setFavoriteIntents] = useState<OfflineFavoriteIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadWarning, setLoadWarning] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    let hadReadFailure = false;
    const readOrFallback = async <T,>(read: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await read();
      } catch {
        hadReadFailure = true;
        return fallback;
      }
    };
    try {
      const [counts, failedList, draftList, salesList, appointmentList, favoriteList] = await Promise.all([
        readOrFallback(() => getQueuedRequestCounts(), { pending: 0, failed: 0 }),
        readOrFallback(() => listFailedRequests(), [] as QueuedRequestSummary[]),
        // FIX AD-DRAFT-USER-SCOPE-01: مسودات صاحب الحساب الحالي فقط —
        // بدونها، مسودة حساب سابق على نفس الجهاز تظهر لحساب جديد.
        readOrFallback(() => listAdDrafts(userId), [] as AdDraft[]),
        readOrFallback(() => listSalesDrafts(userId ?? ''), [] as SalesOfflineDraft[]),
        readOrFallback(() => listOfflineAppointmentDrafts(userId), [] as OfflineAppointmentDraft[]),
        readOrFallback(() => listOfflineFavoriteIntents(userId), [] as OfflineFavoriteIntent[]),
      ]);
      setPending(counts.pending);
      setFailed(counts.failed);
      setFailedItems(failedList);
      setDrafts(draftList);
      setSalesDrafts(salesList);
      setAppointmentDrafts(appointmentList);
      setFavoriteIntents(favoriteList);
      setLoadWarning(hadReadFailure);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onLocalUpdate = () => { void refresh(); };
    window.addEventListener('offline-appointment-drafts:updated', onLocalUpdate);
    window.addEventListener('offline-favorite-intents:updated', onLocalUpdate);
    return () => {
      window.removeEventListener('offline-appointment-drafts:updated', onLocalUpdate);
      window.removeEventListener('offline-favorite-intents:updated', onLocalUpdate);
    };
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
      const favoriteResult = await syncOfflineFavoriteIntents(userId);
      if (favoriteResult.synced > 0 || favoriteResult.failed > 0) {
        toast.message(`المفضلة: تمت مزامنة ${favoriteResult.synced}، تعذّر ${favoriteResult.failed}`);
      }
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
        // requestQueueReplay only requests work from the Service Worker; it
        // does not prove that every queued request has completed. Keep the
        // user-facing message honest and let refreshed counts show the result.
        toast.message('تم طلب المزامنة', {
          description: 'يجري التحقق من حالة الطابور؛ لا يعني هذا اكتمال كل الطلبات.',
          duration: 5000,
        });
      }
      setSyncNotice('تم طلب بدء المزامنة. سيُحدّث التطبيق حالة الطابور بعد وصول النتائج.');
      window.setTimeout(() => void refresh(), 1500);
    } catch {
      setSyncNotice('تعذّر بدء المزامنة. تحقق من الاتصال ثم أعد المحاولة.');
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
    if (draft.publishFilesIncomplete) {
      toast.error('بعض المرفقات لم تُحفظ على الجهاز', { description: 'افتح المسودة وأعد إرفاق الصور الناقصة ثم احفظها قبل إعادة المحاولة.' });
      return;
    }
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

  async function handleRetryAppointmentDraft(draft: OfflineAppointmentDraft) {
    if (!isOnline) { toast.error('اتصل بالإنترنت أولًا لإعادة التحقق من الموعد'); return; }
    try {
      // Resolve an ambiguous earlier response first: if the server committed
      // the appointment but the response was lost, do not create it twice.
      const existing = await appointmentsApi.getMine({
        from: draft.payload.scheduledStart,
        to: draft.payload.scheduledEnd,
        limit: 100,
      });
      const alreadyCreated = existing.data.data?.items?.some((item) =>
        new Date(item.scheduledStart).getTime() === new Date(draft.payload.scheduledStart).getTime() &&
        new Date(item.scheduledEnd).getTime() === new Date(draft.payload.scheduledEnd).getTime() &&
        (draft.payload.requestId ? item.requestId === draft.payload.requestId : item.requestId == null),
      );
      if (alreadyCreated) {
        await deleteOfflineAppointmentDraft(draft.id);
        toast.success('الموعد موجود بالفعل على الخادم');
        await refresh();
        return;
      }
      // The server rechecks working hours and overlapping bookings atomically.
      await appointmentsApi.create(draft.payload);
      await deleteOfflineAppointmentDraft(draft.id);
      toast.success('أكد الخادم الموعد بنجاح');
      await refresh();
    } catch (error) {
      const parsed = getErrorMessage((error as { code?: string })?.code ?? '') ?? (error instanceof Error ? error.message : 'تعذّر تأكيد الموعد');
      await updateOfflineAppointmentDraft(draft.id, { status: 'failed', lastError: parsed });
      toast.error('لم يتم تأكيد الموعد', { description: `${parsed}. لم نعد إرساله تلقائيًا لتجنب حجز مكرر إذا كان رد الخادم قد انقطع.` });
      await refresh();
    }
  }

  async function handleDeleteAppointmentDraft(id: string) {
    await deleteOfflineAppointmentDraft(id);
    await refresh();
    toast.message('حُذف طلب الموعد المحفوظ محليًا');
  }

  async function handleDiscardFavoriteIntent(key: string) {
    try {
      await removeOfflineFavoriteIntent(key);
      await refresh();
      toast.message('أُلغي تغيير المفضلة المعلّق');
    } catch { toast.error('تعذّر إلغاء تغيير المفضلة'); }
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
        {loadWarning ? (
          <p role="alert" className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-strong dark:text-warning">
            تعذّرت قراءة جزء من بيانات المزامنة. قد تكون الأعداد المعروضة غير مكتملة؛ حدّث القائمة للمحاولة مجددًا.
          </p>
        ) : null}
        {syncNotice ? (
          <p role="status" aria-live="polite" className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {syncNotice}
          </p>
        ) : null}
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

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4" />تغييرات المفضلة المعلّقة</h2>
        {favoriteIntents.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">لا توجد تغييرات مفضلة بانتظار المزامنة.</p> : (
          <ul className="divide-y rounded-xl border">
            {favoriteIntents.map((intent) => <li key={intent.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 text-sm"><p className="font-medium">{intent.desired ? 'إضافة إلى المفضلة' : 'إزالة من المفضلة'} · {intent.type === 'AD' ? 'إعلان' : intent.type === 'PRODUCT' ? 'منتج' : intent.type === 'STORE' ? 'متجر' : 'خدمة'}</p><p className="text-xs text-muted-foreground">معرّف العنصر: {intent.entityId} · محفوظ محليًا</p></div>
              <Button variant="ghost" size="sm" onClick={() => void handleDiscardFavoriteIntent(intent.key)}>إلغاء التغيير</Button>
            </li>)}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4" />طلبات مواعيد غير مؤكدة</h2>
        {appointmentDrafts.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">لا توجد طلبات مواعيد محفوظة محليًا.</p> : (
          <ul className="divide-y rounded-xl border">
            {appointmentDrafts.map((draft) => <li key={draft.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 text-sm"><p className="font-medium">{new Date(draft.payload.scheduledStart).toLocaleString('ar')}</p><p className="text-xs text-warning-strong">طلب محفوظ محليًا — الحجز غير مؤكد حتى يوافق الخادم.</p>{draft.lastError ? <p className="text-xs text-destructive">{draft.lastError}</p> : null}</div>
              <div className="flex gap-2"><Button size="sm" onClick={() => void handleRetryAppointmentDraft(draft)} disabled={!isOnline}>إعادة التحقق والإرسال</Button><Button variant="ghost" size="sm" onClick={() => void handleDeleteAppointmentDraft(draft.id)}>حذف</Button></div>
            </li>)}
          </ul>
        )}
      </section>

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
  return new Date(iso).toLocaleString('ar', { timeZone: 'Asia/Gaza' });
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, 'https://local');
    return u.pathname;
  } catch {
    return url.slice(0, 48);
  }
}
