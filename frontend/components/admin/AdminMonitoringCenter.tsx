'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleAlert, Clock3, Cpu, Gauge, Network, RefreshCw, Server, Terminal, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AdminSystemHealth } from '@/components/admin/AdminSystemHealth';
import { AdminSystemTools } from '@/components/admin/AdminSystemTools';
import { AdminDeviceErrorsPanel } from '@/components/admin/AdminDeviceErrorsPanel';
import { AdminNetworkRequestsPanel } from '@/components/admin/AdminNetworkRequestsPanel';
import { AdminConsolePanel } from '@/components/admin/AdminConsolePanel';
import { NetworkStatusBanner } from '@/components/shared/NetworkStatusBanner';
import { useAdminSystemHealth } from '@/hooks/queries/useAdmin';
import { adminApi, type AdminMonitoringAlert, type AdminMonitoringEvent, type AdminMonitoringSample } from '@/api/admin.api';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { DEVICE_ERRORS_EVENT, getDeviceErrorsAsync, type DeviceErrorRecord } from '@/lib/deviceErrorMonitor';
import { NETWORK_REQUESTS_EVENT, getNetworkRequests, type NetworkRequestRecord } from '@/lib/networkRequestMonitor';
import { summarizeDurations } from '@/lib/monitoringMetrics';

function Section({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
        <div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
      </div>
      {children}
    </section>
  );
}

function Metric({ title, value, detail, icon: Icon, tone = 'neutral' }: {
  title: string; value: string | number; detail: string; icon: LucideIcon; tone?: 'neutral' | 'good' | 'warning' | 'danger';
}) {
  const toneClass = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : tone === 'danger' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2"><p className="text-sm text-muted-foreground">{title}</p><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /></div>
      <p className={`mt-2 truncate text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} ث`;
}

/** Unified admin diagnostics surface. The dedicated /offline center remains separate. */
export function AdminMonitoringCenter() {
  const { data: health, isLoading: healthLoading, isError: healthError, isFetching, refetch, dataUpdatedAt } = useAdminSystemHealth();
  const online = useOnlineStatus();
  const [requests, setRequests] = useState<NetworkRequestRecord[]>([]);
  const [errors, setErrors] = useState<DeviceErrorRecord[]>([]);
  const [serverEvents, setServerEvents] = useState<AdminMonitoringEvent[]>([]);
  const [serverAlerts, setServerAlerts] = useState<AdminMonitoringAlert[]>([]);
  const [history, setHistory] = useState<AdminMonitoringSample[]>([]);
  const [serverDiagnosticsUnavailable, setServerDiagnosticsUnavailable] = useState(false);

  const refreshLocalDiagnostics = useCallback(() => {
    setRequests(getNetworkRequests());
    void getDeviceErrorsAsync().then(setErrors).catch(() => setErrors([]));
  }, []);

  const refreshServerDiagnostics = useCallback(async () => {
    try {
      const [eventsResponse, alertsResponse, historyResponse] = await Promise.all([
        adminApi.getMonitoringEvents(50),
        adminApi.getMonitoringAlerts(),
        adminApi.getMonitoringHistory(60),
      ]);
      setServerEvents(eventsResponse.data.data?.events ?? []);
      setServerAlerts(alertsResponse.data.data?.alerts ?? []);
      setHistory(historyResponse.data.data?.samples ?? []);
      setServerDiagnosticsUnavailable(false);
    } catch {
      setServerDiagnosticsUnavailable(true);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (id: string) => {
    try {
      await adminApi.acknowledgeMonitoringAlert(id);
      await refreshServerDiagnostics();
    } catch {
      setServerDiagnosticsUnavailable(true);
    }
  }, [refreshServerDiagnostics]);

  useEffect(() => {
    refreshLocalDiagnostics();
    window.addEventListener(NETWORK_REQUESTS_EVENT, refreshLocalDiagnostics);
    window.addEventListener(DEVICE_ERRORS_EVENT, refreshLocalDiagnostics);
    window.addEventListener('storage', refreshLocalDiagnostics);
    return () => {
      window.removeEventListener(NETWORK_REQUESTS_EVENT, refreshLocalDiagnostics);
      window.removeEventListener(DEVICE_ERRORS_EVENT, refreshLocalDiagnostics);
      window.removeEventListener('storage', refreshLocalDiagnostics);
    };
  }, [refreshLocalDiagnostics]);

  useEffect(() => {
    // M3-M4-FIX: visibility-gated poll with abort
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshServerDiagnostics();
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshServerDiagnostics]);

  const requestStats = useMemo(() => {
    const failures = requests.filter((item) => item.outcome === 'http-error' || item.outcome === 'network-error');
    const durations = summarizeDurations(requests.map((item) => item.durationMs));
    return { total: requests.length, failures: failures.length, ...durations };
  }, [requests]);

  const errorStats = useMemo(() => {
    const errorsCount = errors.reduce((sum, item) => sum + (item.severity === 'error' ? item.count : 0), 0);
    const warningsCount = errors.reduce((sum, item) => sum + (item.severity === 'warning' ? item.count : 0), 0);
    const latest = errors.reduce<number | null>((max, item) => {
      const time = Date.parse(item.occurredAt);
      return Number.isFinite(time) ? Math.max(max ?? 0, time) : max;
    }, null);
    return { errorsCount, warningsCount, latest };
  }, [errors]);

  const services = [health?.db?.ok, health?.redis?.ok].filter((value): value is boolean => typeof value === 'boolean');
  const healthyServices = services.filter(Boolean).length;
  const checkedAt = health?.checkedAt ? new Date(health.checkedAt) : dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const serviceCountLabel = healthError ? '—' : healthLoading ? '…' : services.length ? `${healthyServices}/${services.length}` : '—';
  const queueIssues = health?.backgroundWork?.available
    ? Number(health.backgroundWork.deadLetterOutbox ?? 0) + Number(health.backgroundWork.staleOutbox ?? 0) + Number(health.backgroundWork.unresolvedFailedTasks ?? 0)
    : null;
  const heapPercent = health?.runtime?.memoryHeapUsedPercent;
  const hardInfrastructureIssue = healthError || services.some((value) => value === false) || (typeof heapPercent === 'number' && heapPercent >= 90);
  const softInfrastructureIssue = (queueIssues !== null && queueIssues > 0) || (typeof heapPercent === 'number' && heapPercent >= 75);
  const systemStatus = healthError ? 'غير متاح' : healthLoading ? 'جارٍ الفحص' : services.length === 0 ? 'لا توجد بيانات' : hardInfrastructureIssue || softInfrastructureIssue ? 'يحتاج انتباه' : 'سليم';
  const systemTone = hardInfrastructureIssue ? 'danger' : healthLoading || services.length === 0 || softInfrastructureIssue ? 'warning' : 'good';
  const activeIssueCount = (healthError ? 1 : 0)
    + (services.some((value) => value === false) ? 1 : 0)
    + (requestStats.failures > 0 ? 1 : 0)
    + (errorStats.errorsCount > 0 ? 1 : 0)
    + (queueIssues !== null && queueIssues > 0 ? 1 : 0)
    + (typeof heapPercent === 'number' && heapPercent >= 85 ? 1 : 0);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="rounded-2xl border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Gauge className="h-6 w-6" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">مركز مراقبة المنصّة</h1><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${systemTone === 'good' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : systemTone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{systemTone === 'good' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{systemStatus}</span></div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">ملخّص تشغيلي يفرّق بين صحة الخادم والخدمات وبين التشخيص المحلي لهذا المتصفح. الأرقام المحلية ليست إحصاءات لجميع زوار المنصّة.</p>
              <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${activeIssueCount ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`} aria-live="polite">{activeIssueCount ? `${activeIssueCount} مؤشرات تحتاج مراجعة` : 'لا توجد مؤشرات مشكلة ضمن البيانات المتاحة'}</p>
              <p className="mt-2 text-xs text-muted-foreground">آخر فحص للخدمات: {checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt.toLocaleString('ar-PS') : 'لم يصل فحص ناجح بعد'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { refreshLocalDiagnostics(); void refetch(); void refreshServerDiagnostics(); }} disabled={isFetching} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />{isFetching ? 'جارٍ التحديث…' : 'تحديث الفحوصات'}</button>
            <a href="/offline" className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><WifiOff className="h-4 w-4" />مركز الأوفلاين</a>
          </div>
        </div>
      </header>

      <NetworkStatusBanner />

      <section aria-label="ملخص المراقبة" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="صحة الخدمات" value={serviceCountLabel} detail={healthError ? 'تعذّر الوصول إلى فحص الإدارة' : 'قاعدة البيانات وRedis؛ لا تشمل الخدمات الخارجية غير المفحوصة'} icon={Server} tone={systemTone} />
        <Metric title="اتصال هذا الجهاز" value={online ? 'متصل' : 'غير متصل'} detail="حالة اتصال المتصفح الحالي فقط" icon={online ? Wifi : WifiOff} tone={online ? 'good' : 'danger'} />
        <Metric title="طلبات الشبكة المسجّلة" value={requestStats.total} detail={`${requestStats.failures} طلب فاشل من آخر 300 سجل محلي`} icon={Network} tone={requestStats.failures ? 'warning' : 'neutral'} />
        <Metric title="أخطاء الواجهة" value={errorStats.errorsCount} detail={`${errorStats.warningsCount} تحذيرًا محليًا مسجّلًا`} icon={CircleAlert} tone={errorStats.errorsCount ? 'danger' : 'neutral'} />
        <Metric title="متوسط زمن الطلب" value={requestStats.average === null ? '—' : formatDuration(requestStats.average)} detail="محسوب من سجل المتصفح المتاح حاليًا" icon={Clock3} />
        <Metric title="P50 لزمن الطلب" value={requestStats.p50 === null ? '—' : formatDuration(requestStats.p50)} detail="المئين 50 (الوسيط) من العينة المحلية" icon={Activity} />
        <Metric title="P95 لزمن الطلب" value={requestStats.p95 === null ? '—' : formatDuration(requestStats.p95)} detail="المئين 95 من العينة المحلية؛ ليس مقياسًا عالميًا" icon={Activity} />
        <Metric title="P99 لزمن الطلب" value={requestStats.p99 === null ? '—' : formatDuration(requestStats.p99)} detail="المئين 99 من العينة المحلية؛ العينة الصغيرة محدودة الدلالة" icon={Activity} />
        <Metric title="آخر خطأ واجهة" value={errorStats.latest === null ? '—' : new Date(errorStats.latest).toLocaleTimeString('ar-PS')} detail="وقت آخر سجل خطأ محلي" icon={AlertTriangle} tone={errorStats.errorsCount ? 'warning' : 'neutral'} />
        <Metric title="حالة القياس" value={healthError ? 'فشل الفحص' : healthLoading ? 'قيد الفحص' : 'متاح'} detail="الفحص الخلفي مخزّن مؤقتًا لمدة تصل إلى دقيقة" icon={Cpu} tone={healthError ? 'danger' : healthLoading ? 'warning' : 'good'} />
      </section>

      <section className="rounded-2xl border border-dashed bg-muted/20 p-4 sm:p-5">
        <h2 className="font-semibold">كيف تقرأ اللوحة؟</h2>
        <ul className="mt-2 grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
          <li>• <strong className="text-foreground">صحة الخدمات:</strong> فحص فعلي لاتصال قاعدة البيانات وRedis عبر الخادم، وليس مجرد نجاح تحميل الصفحة.</li>
          <li>• <strong className="text-foreground">طلبات الشبكة والأخطاء:</strong> محفوظة على هذا الجهاز/المتصفح، وقد تختفي عند مسح بياناته أو استخدام جهاز آخر.</li>
          <li>• <strong className="text-foreground">متوسط وP50/P95/P99:</strong> مبنية على الطلبات المسجلة فقط؛ لا تمثّل كل مستخدمي المنصة ولا تاريخًا دائمًا، وتكون المئينات أقل دلالة عندما تكون العينة صغيرة.</li>
          <li>• <strong className="text-foreground">مؤشرات المراجعة:</strong> تجمع إشارات ظاهرة مثل فشل الخدمات، أخطاء المتصفح، فشل الطلبات، تراكم المهام، وارتفاع استخدام Heap؛ وليست نظام تنبيه مركزيًا.</li>
          <li>• <strong className="text-foreground">غير متاح:</strong> يعني أن الفحص لم يعطِ بيانات موثوقة؛ لا نعرضه على أنه سليم أو متعطل دون دليل.</li>
        </ul>
      </section>


      <Section title="التنبيهات التشغيلية" description="قواعد تنبيه بسيطة مبنية على أخطاء الخادم والطلبات البطيئة خلال آخر خمس دقائق. الإقرار مؤقت داخل عملية الخادم ولا يُعد سجلًا دائمًا بعد إعادة التشغيل." icon={AlertTriangle}>
        {serverDiagnosticsUnavailable ? <p className="text-sm text-muted-foreground">تعذّر تحميل بيانات التنبيهات المركزية. تحقّق من صلاحية المدير واتصال API.</p> : (
          <div className="space-y-3">
            {serverAlerts.map((alert) => <div key={alert.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><strong>{alert.title}</strong><span className={`rounded-full px-2 py-0.5 text-xs ${alert.status === 'active' ? 'bg-destructive/10 text-destructive' : alert.status === 'acknowledged' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>{alert.status === 'active' ? 'نشط' : alert.status === 'acknowledged' ? 'تمت المراجعة' : 'محلول'}</span><span className="text-xs text-muted-foreground">{alert.severity === 'critical' ? 'حرج' : 'تحذير'}</span></div>
                <p className="mt-1 text-sm text-muted-foreground">{alert.description} — الحالي: {alert.value} / العتبة: {alert.threshold}</p>
              </div>
              {alert.status === 'active' && <button type="button" onClick={() => void acknowledgeAlert(alert.id)} className="h-9 shrink-0 rounded-lg border px-3 text-sm hover:bg-muted">إقرار التنبيه</button>}
            </div>)}
          </div>
        )}
        <p className="text-xs text-muted-foreground">عتبات قابلة للضبط من متغيرات البيئة: MONITORING_ALERT_5XX_THRESHOLD وMONITORING_ALERT_HTTP_ERROR_THRESHOLD وMONITORING_ALERT_SLOW_THRESHOLD.</p>
      </Section>

      <Section title="سجل أحداث الخادم وربط الطلبات" description="يعرض الأخطاء والطلبات البطيئة من الخادم مع Request ID لتسهيل البحث في سجلات الخادم. لا يُسجّل عنوان URL الخام أو محتوى الطلب." icon={Network}>
        {serverDiagnosticsUnavailable ? <p className="text-sm text-muted-foreground">سجل أحداث الخادم غير متاح حاليًا.</p> : serverEvents.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أخطاء أو طلبات بطيئة ضمن آخر 500 حدث محفوظ في ذاكرة العملية.</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-muted/50"><tr><th className="p-3">الوقت</th><th className="p-3">النوع</th><th className="p-3">الطلب</th><th className="p-3">الحالة</th><th className="p-3">المدة</th><th className="p-3">Request ID</th></tr></thead><tbody>{serverEvents.map((event) => <tr key={event.id} className="border-t"><td className="p-3 whitespace-nowrap">{new Date(event.timestamp).toLocaleString('ar-PS')}</td><td className="p-3">{event.kind === 'http-error' ? 'خطأ HTTP' : 'طلب بطيء'}</td><td className="p-3"><span dir="ltr">{event.method} {event.route}</span>{event.errorCode ? <span className="block text-xs text-muted-foreground">{event.errorCode}</span> : null}</td><td className="p-3">{event.statusCode}</td><td className="p-3">{formatDuration(event.durationMs)}</td><td className="p-3"><button type="button" onClick={() => { void navigator.clipboard?.writeText(event.requestId); }} className="font-mono text-xs underline underline-offset-2" title="نسخ Request ID">{event.requestId.slice(0, 18)}…</button></td></tr>)}</tbody></table></div>}
        <p className="text-xs text-muted-foreground">الأحداث محفوظة مؤقتًا في ذاكرة نسخة الخادم الحالية، حتى 500 حدث. عند تشغيل أكثر من نسخة، كل نسخة لها سجل منفصل.</p>
      </Section>

      <Section title="تاريخ المقاييس" description="عينة كل دقيقة لمعدل الطلبات والأخطاء والذاكرة. السجل الحالي محلي لعملية الخادم؛ استخدم Prometheus مع تخزين خارجي لتاريخ دائم ومتعدد النسخ." icon={Activity}>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد عينات مكتملة بعد. يبدأ حفظ العينات بعد انتقال الدقيقة الأولى أثناء استقبال الطلبات.</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[650px] text-right text-sm"><thead className="bg-muted/50"><tr><th className="p-3">الدقيقة</th><th className="p-3">الطلبات</th><th className="p-3">أخطاء HTTP</th><th className="p-3">5xx</th><th className="p-3">متوسط الزمن</th><th className="p-3">Heap</th></tr></thead><tbody>{[...history].reverse().map((sample) => <tr key={sample.timestamp} className="border-t"><td className="p-3 whitespace-nowrap">{new Date(sample.timestamp).toLocaleString('ar-PS')}</td><td className="p-3">{sample.requests}</td><td className="p-3">{sample.errors}</td><td className="p-3">{sample.serverErrors}</td><td className="p-3">{formatDuration(sample.averageDurationMs)}</td><td className="p-3">{sample.heapUsedBytes ? `${(sample.heapUsedBytes / 1024 / 1024).toFixed(1)} MB` : '—'}</td></tr>)}</tbody></table></div>}
        <p className="text-xs text-muted-foreground">الاحتفاظ المحلي بحد أقصى 24 ساعة (1440 عينة). عينات الذاكرة لا تُعد بديلًا عن مراقبة Prometheus/Grafana.</p>
      </Section>

      <Section title="صحة الخادم والخدمات" description="فحص اتصال قاعدة البيانات وRedis، وزمن الاستجابة، ومعلومات تشغيل عملية Node.js المتاحة من الخادم." icon={Activity}>
        <AdminSystemHealth />
        <AdminSystemTools />
      </Section>
      <Section title="طلبات الشبكة" description="تفاصيل fetch وXMLHttpRequest: الحالة، المسار، الزمن، وأخطاء الاتصال. لا تُحفظ أجسام الطلبات أو ترويساتها." icon={Network}>
        <AdminNetworkRequestsPanel />
      </Section>
      <Section title="أخطاء الجهاز والواجهة" description="أخطاء JavaScript والوعود والتحميل وHTTP التي التقطها التطبيق في هذا المتصفح، مع التجميع حسب البصمة والمسار." icon={CircleAlert}>
        <AdminDeviceErrorsPanel />
      </Section>
      <Section title="الكونسول التشخيصي" description="أوامر تشخيص محددة لمراجعة المصادقة والكاش والتخزين وحالة الاتصال. لا يوجد تنفيذ JavaScript حر." icon={Terminal}>
        <AdminConsolePanel />
      </Section>
    </div>
  );
}
