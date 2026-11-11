'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, Clipboard, Download, Filter, RefreshCw, Search, Trash2, Wifi, WifiOff, Clock3, ArrowDownToLine, ArrowUpRight } from 'lucide-react';
import { clearNetworkRequests, getNetworkRequests, NETWORK_REQUESTS_EVENT, summarizeNetworkRequestsByRoute, type NetworkRequestOutcome, type NetworkRequestRecord } from '@/lib/networkRequestMonitor';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { summarizeDurations } from '@/lib/monitoringMetrics';

const outcomeLabel: Record<NetworkRequestOutcome, string> = {
  success: 'ناجح', 'http-error': 'خطأ HTTP', 'network-error': 'فشل اتصال', aborted: 'ملغى',
};
const outcomeClass: Record<NetworkRequestOutcome, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'http-error': 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'network-error': 'bg-red-500/10 text-red-700 dark:text-red-300',
  aborted: 'bg-muted text-muted-foreground',
};
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-PS', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }).format(date);
};
const formatDuration = (value: number | null) => value === null ? '—' : `${Math.max(0, Math.round(value)).toLocaleString('ar-PS')} مللي ثانية`;
const formatBytes = (value: number) => {
  if (value < 1024) return `${value.toLocaleString('ar-PS')} بايت`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

export function AdminNetworkRequestsPanel() {
  const [records, setRecords] = useState<NetworkRequestRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('all');
  const [method, setMethod] = useState('all');
  const [kind, setKind] = useState('all');
  const [route, setRoute] = useState('all');
  const [statusGroup, setStatusGroup] = useState('all');
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [copied, setCopied] = useState(false);
  const online = useOnlineStatus();

  const refresh = useCallback(() => setRecords(getNetworkRequests()), []);
  useEffect(() => {
    refresh();
    window.addEventListener(NETWORK_REQUESTS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(NETWORK_REQUESTS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const methods = useMemo(() => [...new Set(records.map((row) => row.method))].sort(), [records]);
  const routes = useMemo(() => [...new Set(records.map((row) => row.pageRoute))].sort(), [records]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((row) => (outcome === 'all' || row.outcome === outcome)
      && (method === 'all' || row.method === method)
      && (kind === 'all' || row.kind === kind)
      && (route === 'all' || row.pageRoute === route)
      && (statusGroup === 'all' || (statusGroup === '4xx' && row.status >= 400 && row.status < 500)
        || (statusGroup === '5xx' && row.status >= 500 && row.status < 600)
        || (statusGroup === 'no-response' && row.status === 0))
      && (!onlyFailures || row.outcome !== 'success')
      && (!needle || `${row.method} ${row.url} ${row.pageRoute} ${row.status} ${row.statusText ?? ''} ${row.requestId ?? ''} ${row.error ?? ''} ${row.outcome}`.toLowerCase().includes(needle)));
  }, [records, query, outcome, method, kind, route, statusGroup, onlyFailures]);
  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;
  const failureCount = records.filter((row) => row.outcome === 'http-error' || row.outcome === 'network-error').length;
  const successCount = records.filter((row) => row.outcome === 'success').length;
  const durationStats = summarizeDurations(filtered.map((row) => row.durationMs));
  const knownResponseBytes = filtered.reduce((total, row) => total + (row.responseBytes ?? 0), 0);
  const trackedReadCount = filtered.filter((row) =>
    (row.method === 'GET' || row.method === 'HEAD' || row.method === 'OPTIONS')
    && typeof row.concurrentDuplicate === 'boolean',
  ).length;
  const concurrentDuplicateCount = filtered.filter((row) => row.concurrentDuplicate === true).length;
  const duplicateRate = trackedReadCount ? `${((concurrentDuplicateCount / trackedReadCount) * 100).toFixed(1)}%` : '—';
  const sizedResponses = filtered.filter((row) => Number.isSafeInteger(row.responseBytes) && (row.responseBytes ?? -1) >= 0).length;
  const cacheHitCount = filtered.filter((row) => row.cacheStatus === 'HIT').length;
  const cacheMissCount = filtered.filter((row) => row.cacheStatus === 'MISS').length;
  const cacheStaleCount = filtered.filter((row) => row.cacheStatus === 'STALE').length;
  const cacheEligibleCount = cacheHitCount + cacheMissCount + cacheStaleCount;
  const cacheHitRate = cacheEligibleCount ? `${((cacheHitCount / cacheEligibleCount) * 100).toFixed(1)}%` : '—';
  const routeSummaries = useMemo(() => summarizeNetworkRequestsByRoute(filtered).slice(0, 8), [filtered]);

  const copyReport = async (row?: NetworkRequestRecord) => {
    const payload = {
      generatedAt: new Date().toISOString(),
      scope: 'local browser only; safe request metadata plus validated X-Request-Id only; no auth headers or request/response bodies',
      filters: { query, outcome, method, kind, route, statusGroup, onlyFailures },
      count: row ? 1 : filtered.length,
      requests: row ? [row] : filtered,
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
    catch {
      window.prompt('انسخ تقرير طلبات الشبكة:', text);
    }
  };
  const downloadReport = () => {
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'local browser only; metadata plus validated X-Request-Id only; no auth headers or bodies', filters: { query, outcome, method, kind, route, statusGroup, onlyFailures }, requests: filtered }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `marketplat-network-requests-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clearAll = () => {
    if (window.confirm('هل تريد مسح سجل طلبات الشبكة من هذا المتصفح؟ لا يمكن التراجع عن ذلك.')) {
      clearNetworkRequests();
      setSelectedId(null);
      setRecords([]);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Activity className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">مراقب طلبات الشبكة</h1>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${online ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:text-red-300'}`}>
                {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {online ? 'الجهاز متصل' : 'الجهاز غير متصل'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">عرض واضح لطلبات fetch وXMLHttpRequest: الحالة، الزمن، المسار، وأخطاء الاتصال. السجل محلي؛ لا يحفظ أجسام الطلبات أو الاستجابات أو ترويسات المصادقة، ويسجل معرّف الطلب UUID فقط لربط الخطأ بسجلات الخادم.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" /> تحديث</button>
          <button type="button" onClick={() => void copyReport()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted">
            <Clipboard className="h-4 w-4" />
            {copied ? 'تم النسخ' : 'نسخ التقرير'}
          </button>
          <button type="button" onClick={downloadReport} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" /> تنزيل JSON</button>
          <button type="button" onClick={clearAll} className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/30 px-3 text-sm text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /> مسح السجل</button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="الطلبات المحفوظة" value={records.length} detail="آخر 300 طلب في هذا المتصفح" icon={<ArrowDownToLine className="h-4 w-4" />} />
        <Metric title="طلبات ناجحة" value={successCount} detail="استجابة HTTP ناجحة" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Metric title="طلبات فاشلة" value={failureCount} detail="HTTP 4xx/5xx أو فشل اتصال" icon={<CircleAlert className="h-4 w-4" />} danger={failureCount > 0} />
        <Metric title="متوسط زمن الاستجابة" value={formatDuration(durationStats.average)} detail="محسوب من السجل المحلي" icon={<Clock3 className="h-4 w-4" />} />
        <Metric title="P50 / الوسيط" value={formatDuration(durationStats.p50)} detail="نصف العينة تقريبًا أسرع أو يساوي هذه القيمة" icon={<Clock3 className="h-4 w-4" />} />
        <Metric title="P95 / المئين 95" value={formatDuration(durationStats.p95)} detail="قياس ذيل زمن الاستجابة في هذه العينة" icon={<Clock3 className="h-4 w-4" />} />
        <Metric title="P99 / المئين 99" value={formatDuration(durationStats.p99)} detail="قد لا يكون ذا دلالة مع عينة صغيرة" icon={<Clock3 className="h-4 w-4" />} />
        <Metric title="حجم الاستجابات المعروف" value={formatBytes(knownResponseBytes)} detail={`${sizedResponses} من ${filtered.length} استجابة لديها Content-Length قابل للقراءة`} icon={<ArrowDownToLine className="h-4 w-4" />} />
        <Metric title="قراءات متطابقة متزامنة" value={concurrentDuplicateCount} detail={`${duplicateRate} من طلبات القراءة الآمنة؛ أول طلب في المجموعة لا يُحسب`} icon={<Activity className="h-4 w-4" />} />
        <Metric title="معدل إصابة الكاش" value={cacheHitRate} detail={`${cacheHitCount} HIT · ${cacheMissCount} MISS · ${cacheStaleCount} STALE؛ لا يشمل BYPASS`} icon={<Activity className="h-4 w-4" />} />
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Filter className="h-4 w-4" /> البحث والتصفية</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFailures} onChange={(event) => setOnlyFailures(event.target.checked)} /> الفاشلة فقط</label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative sm:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالمسار أو الحالة أو الخطأ…" className="h-10 w-full rounded-lg border bg-background pe-3 ps-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <Select label="النتيجة" value={outcome} onChange={setOutcome} options={[['all', 'كل النتائج'], ['success', 'ناجح'], ['http-error', 'خطأ HTTP'], ['network-error', 'فشل اتصال'], ['aborted', 'ملغى']]} />
          <Select label="الطريقة" value={method} onChange={setMethod} options={[['all', 'كل الطرق'], ...methods.map((item) => [item, item] as [string, string])]} />
          <Select label="المصدر" value={kind} onChange={setKind} options={[['all', 'كل المصادر'], ['fetch', 'Fetch'], ['xhr', 'XMLHttpRequest']]} />
          <Select label="صفحة المصدر" value={route} onChange={setRoute} options={[['all', 'كل الصفحات'], ...routes.map((item) => [item, item] as [string, string])]} />
          <Select label="فئة HTTP" value={statusGroup} onChange={setStatusGroup} options={[['all', 'كل فئات HTTP'], ['4xx', 'HTTP 4xx'], ['5xx', 'HTTP 5xx'], ['no-response', 'بلا استجابة HTTP']]} />
        </div>
        <p className="text-xs text-muted-foreground">يعرض {filtered.length.toLocaleString('ar-PS')} من أصل {records.length.toLocaleString('ar-PS')} طلب. تُخفى قيم query string الحساسة/الشخصية في السجل عمدًا.</p>
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="font-semibold">ملخص الطلبات حسب الصفحة</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">تعرض العينة المحفوظة فقط. الحجم يجمع ترويسة Content-Length المتاحة؛ الاستجابات التي لا تعرضها تُحسب كحجم غير معروف، ولا يُفترض أن المجموع يساوي إجمالي النقل الفعلي.</p>
        </div>
        {routeSummaries.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">لا توجد بيانات كافية بعد.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5">مسار الصفحة</th>
                <th className="p-2.5">الطلبات</th>
                <th className="p-2.5">الأخطاء</th>
                <th className="p-2.5">الملغاة</th>
                <th className="p-2.5">قراءات متزامنة</th>
                <th className="p-2.5">متوسط الزمن</th>
                <th className="p-2.5">P95</th>
                <th className="p-2.5">إصابة الكاش</th>
                <th className="p-2.5">الحجم المعروف</th>
                <th className="p-2.5">عينات الحجم</th>
              </tr>
            </thead>
            <tbody>
              {routeSummaries.map((item) => <tr key={item.pageRoute} className="border-t">
                <td className="max-w-[220px] p-2.5 font-mono text-xs" dir="ltr">
                  <span className="block truncate" title={item.pageRoute}>
                    {item.pageRoute}
                  </span>
                </td>
                <td className="p-2.5 tabular-nums">
                  {item.requestCount}
                </td>
                <td className="p-2.5 tabular-nums">
                  {item.failedCount}
                </td>
                <td className="p-2.5 tabular-nums">
                  {item.abortedCount}
                </td>
                <td className="p-2.5 tabular-nums">
                  {item.concurrentDuplicateCount}
                </td>
                <td className="p-2.5 tabular-nums">
                  {formatDuration(item.averageDurationMs)}
                </td>
                <td className="p-2.5 tabular-nums">
                  {formatDuration(item.p95DurationMs)}
                </td>
                <td className="p-2.5 tabular-nums">
                  {item.cacheHitRate === null ? '—' : `${item.cacheHitRate.toFixed(1)}% (${item.cacheHitCount}/${item.cacheHitCount + item.cacheMissCount + item.cacheStaleCount})`}
                </td>
                <td className="p-2.5 tabular-nums">
                  {formatBytes(item.knownResponseBytes)}
                </td>
                <td className="p-2.5 tabular-nums">{item.sizedResponseCount}/{item.requestCount}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-semibold">سجل الطلبات</h2>
          <span className="text-xs text-muted-foreground">الأحدث أولًا · اختر طلبًا لعرض التفاصيل</span>
        </div>
        {filtered.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium">لا توجد طلبات مطابقة</p>
          <p className="max-w-lg text-sm text-muted-foreground">انتقل إلى صفحات التطبيق ونفّذ عمليات مثل البحث أو فتح الإعلانات أو تحميل الرسائل، ثم ارجع إلى هنا. يبدأ التسجيل بعد تثبيت هذه النسخة.</p>
        </div> : <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[850px] border-collapse text-right text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-3 font-medium">الوقت</th>
                <th className="px-3 py-3 font-medium">الطريقة</th>
                <th className="px-3 py-3 font-medium">المسار</th>
                <th className="px-3 py-3 font-medium">صفحة المصدر</th>
                <th className="px-3 py-3 font-medium">الحالة</th>
                <th className="px-3 py-3 font-medium">المدة</th>
                <th className="px-3 py-3 font-medium">الحجم</th>
                <th className="px-3 py-3 font-medium">المصدر</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => <tr key={row.id} onClick={() => setSelectedId(row.id)} className={`cursor-pointer border-t transition-colors hover:bg-muted/60 ${selected?.id === row.id ? 'bg-primary/5' : ''}`}>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                  {formatTime(row.startedAt)}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-md border px-2 py-1 font-mono text-2xs-tight font-semibold">
                    {row.method}
                  </span>
                </td>
                <td className="max-w-[360px] px-3 py-3">
                  <p className="break-all font-mono text-xs" dir="ltr">
                    {row.url}
                  </p>
                  {row.error && <p className="mt-1 max-w-md truncate text-xs text-red-600" title={row.error}>
                    {row.error}
                  </p>}
                </td>
                <td className="max-w-[180px] px-3 py-3">
                  <p className="truncate font-mono text-xs" dir="ltr" title={row.pageRoute}>
                    {row.pageRoute}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${outcomeClass[row.outcome]}`}>
                    {row.status ? `${row.status} · ` : ''}
                    {outcomeLabel[row.outcome]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.durationMs} ms</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">
                  {row.responseBytes === undefined ? '—' : formatBytes(row.responseBytes)}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {row.kind === 'fetch' ? 'Fetch' : 'XHR'}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>

      {selected && <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">تفاصيل الطلب المحدد</h2>
              <span className={`rounded-full px-2 py-1 text-xs ${outcomeClass[selected.outcome]}`}>
                {outcomeLabel[selected.outcome]}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatTime(selected.startedAt)} · معرّف محلي: {selected.id}</p>
          </div>
          <button type="button" onClick={() => void copyReport(selected)} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Clipboard className="h-4 w-4" /> نسخ هذا الطلب</button>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['صفحة المصدر', selected.pageRoute], ['الطريقة', selected.method], ['الحالة', selected.status ? `${selected.status} ${selected.statusText ?? ''}`.trim() : 'لا توجد استجابة HTTP'], ['المدة', `${selected.durationMs} ms`], ['نوع التنفيذ', selected.kind === 'fetch' ? 'Fetch API' : 'XMLHttpRequest'], ['حجم الاستجابة', selected.responseBytes === undefined ? 'غير متاح من Content-Length' : formatBytes(selected.responseBytes)], ['حالة X-Cache', selected.cacheStatus ?? 'غير متاحة'], ['قراءة متطابقة متزامنة', selected.concurrentDuplicate === true ? 'نعم، طلب قراءة مطابق آخر كان جاريًا' : selected.concurrentDuplicate === false ? 'لا' : 'غير مسجل (سجل قديم)'], ['Request ID', selected.requestId ?? 'غير متاح من الخادم'],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 break-words font-medium" dir={label === 'الطريقة' ? 'ltr' : 'auto'}>
              {value}
            </dd>
          </div>)}
        </dl>
        <div className="rounded-xl border p-3">
          <p className="mb-2 text-xs text-muted-foreground">عنوان الطلب بعد إخفاء قيم معاملات URL</p>
          <p className="break-all font-mono text-sm" dir="ltr">
            {selected.url}
          </p>
          {selected.error && <p className="mt-3 break-words text-sm text-red-600">
            {selected.error}
          </p>}
        </div>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" /> لا يتضمن هذا السجل أجسام الطلبات أو الاستجابات أو ترويسات المصادقة. يُحفظ X-Request-Id بعد التحقق من UUID، وContent-Length كرقم، وX-Cache من قائمة حالات محددة. حجم الاستجابة غير متاح دائمًا وقد لا يعكس حجم النقل في كل طبقات التخزين المؤقت؛ استخدم DevTools لقياس Transfer Size بدقة. مؤشر التكرار لا يحسب إلا طلبات GET/HEAD/OPTIONS المتطابقة والمتداخلة على مستوى النقل، ولا يعني أن تكرار استدعاء مسار بمرشحات مختلفة خطأ.</p>
      </section>}
    </div>
  );
}

function Metric({ title, value, detail, icon, danger = false }: { title: string; value: string | number; detail: string; icon: React.ReactNode; danger?: boolean }) {
  return <div className="rounded-2xl border bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {title}
      </p>
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${danger ? 'bg-red-500/10 text-red-600' : 'bg-primary/10 text-primary'}`}>
        {icon}
      </span>
    </div>
    <p className={`mt-3 text-2xl font-bold tabular-nums ${danger ? 'text-red-600' : ''}`}>
      {value}
    </p>
    <p className="mt-1 text-xs text-muted-foreground">
      {detail}
    </p>
  </div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="block">
    <span className="sr-only">
      {label}
    </span>
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>
        {text}
      </option>)}
    </select>
  </label>;
}
