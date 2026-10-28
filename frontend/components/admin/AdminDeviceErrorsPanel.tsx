'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, Download, RefreshCw, Search, Trash2, Wifi, WifiOff, Bug, Layers3, Activity, Filter } from 'lucide-react';
import { clearDeviceErrors, DEVICE_ERRORS_EVENT, getDeviceErrors, getDeviceErrorsAsync, isReproduceMode, setReproduceMode, type DeviceErrorRecord } from '@/lib/deviceErrorMonitor';

const categoryNames: Record<string, string> = {
  runtime: 'خطأ JavaScript', promise: 'وعد غير معالج', hydration: 'تعارض Hydration / React',
  console: 'خطأ سجّله التطبيق', 'console-warning': 'تحذير Console', 'resource-load': 'فشل تحميل ملف', 'network-request': 'فشل طلب شبكة',
  'http-server': 'خطأ من الخادم (HTTP 5xx)', connectivity: 'حالة الاتصال',
};
const severityNames = { error: 'خطأ', warning: 'تنبيه', network: 'شبكة', debug: 'تشخيص' } as const;
const timeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-PS', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
};
const hourLabel = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export function AdminDeviceErrorsPanel() {
  const [records, setRecords] = useState<DeviceErrorRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [route, setRoute] = useState('all');
  const [grouped, setGrouped] = useState(true);
  const [reproduce, setReproduce] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setRecords(getDeviceErrors());
    void getDeviceErrorsAsync().then(setRecords);
  }, []);
  useEffect(() => {
    setReproduce(isReproduceMode());
    refresh();
    window.addEventListener(DEVICE_ERRORS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DEVICE_ERRORS_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [refresh]);

  const routeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((item) => counts.set(item.route, (counts.get(item.route) ?? 0) + item.count));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [records]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((item) => (category === 'all' || item.category === category)
      && (severity === 'all' || item.severity === severity)
      && (route === 'all' || item.route === route)
      && (!needle || [item.title, item.message, item.route, item.source, item.stack, item.details, item.category].some((part) => part?.toLowerCase().includes(needle))));
  }, [records, query, category, severity, route]);
  const groupedRows = useMemo(() => {
    if (!grouped) return filtered.map((record) => ({ key: record.id, record, occurrences: record.count, latest: record.occurredAt }));
    const map = new Map<string, { key: string; record: DeviceErrorRecord; occurrences: number; latest: string }>();
    filtered.forEach((record) => {
      const key = `${record.fingerprint}|${record.route}`;
      const current = map.get(key);
      if (current) { current.occurrences += record.count; if (Date.parse(record.occurredAt) > Date.parse(current.latest)) { current.latest = record.occurredAt; current.record = record; } }
      else map.set(key, { key, record, occurrences: record.count, latest: record.occurredAt });
    });
    return [...map.values()].sort((a, b) => Date.parse(b.latest) - Date.parse(a.latest));
  }, [filtered, grouped]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const errorCount = records.filter((item) => item.severity === 'error').reduce((sum, item) => sum + item.count, 0);
  const networkCount = records.filter((item) => item.severity === 'network').reduce((sum, item) => sum + item.count, 0);
  const hydrationCount = records.filter((item) => item.category === 'hydration').reduce((sum, item) => sum + item.count, 0);
  const timeline = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const end = Date.now() - (11 - index) * 5 * 60_000;
    const start = end - 5 * 60_000;
    const count = records.reduce((sum, item) => { const time = Date.parse(item.occurredAt); return sum + (time >= start && time < end ? item.count : 0); }, 0);
    return { label: hourLabel(new Date(end)), count };
  }), [records]);
  const maxTimeline = Math.max(1, ...timeline.map((item) => item.count));

  const copyReport = async (item?: DeviceErrorRecord) => {
    const currentRecords = await getDeviceErrorsAsync();
    const payload = item ? { generatedAt: new Date().toISOString(), scope: 'this browser profile only', record: item } : {
      generatedAt: new Date().toISOString(), scope: 'this browser profile only', count: currentRecords.length,
      activeRoute: window.location.pathname, activeFilters: { query, category, severity, route },
      reproductionMode: isReproduceMode(), records: currentRecords,
    };
    const text = JSON.stringify(payload, null, 2);
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt('انسخ التقرير يدويًا:', text); }
  };
  const downloadReport = async () => {
    const allRecords = await getDeviceErrorsAsync();
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'this browser profile only', reproductionMode: isReproduceMode(), records: allRecords }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `marketplat-device-errors-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clearAll = () => {
    if (window.confirm('هل تريد حذف سجل الأخطاء المحلي من هذا المتصفح؟ لا يمكن التراجع عن ذلك.')) { clearDeviceErrors(); setSelectedId(null); setRecords([]); }
  };
  const toggleReproduce = (enabled: boolean) => { setReproduce(enabled); setReproduceMode(enabled); refresh(); };

  return (
    <div className="space-y-5" dir="rtl">
      <header className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><AlertTriangle className="h-5 w-5" /></span><div><h1 className="text-xl font-bold">مركز أخطاء هذا الجهاز</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">أداة محلية مكملة لـ Sentry: تحفظ سياق المتصفح ومسار التنقل وآخر الإجراءات قبل الخطأ، وتعمل دون إرسال السجلات إلى خادم خارجي.</p></div></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" /> تحديث</button>
          <button type="button" onClick={() => void copyReport()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Clipboard className="h-4 w-4" /> {copied ? 'تم النسخ' : 'نسخ التقرير'}</button>
          <button type="button" onClick={() => void downloadReport()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" /> تنزيل JSON</button>
          <button type="button" onClick={clearAll} className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/30 px-3 text-sm text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /> مسح السجل</button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="سجلات الأخطاء" value={records.length} detail="حتى 1,000 سجل، أو 5,000 بوضع إعادة الإنتاج" />
        <Metric title="أحداث أخطاء" value={errorCount} detail="React / JavaScript / HTTP 5xx" danger={errorCount > 0} />
        <Metric title="أحداث الشبكة" value={networkCount} detail="طلبات فاشلة أو انقطاع الاتصال" />
        <Metric title="Hydration" value={hydrationCount} detail="أخطاء توافق HTML بين الخادم والمتصفح" danger={hydrationCount > 0} />
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4" /><h2 className="font-semibold">الخط الزمني — آخر 60 دقيقة</h2><span className="text-xs text-muted-foreground">أحداث محلية مسجلة</span></div>
        <div className="grid h-24 grid-cols-12 items-end gap-2" aria-label="رسم بياني للأخطاء خلال آخر ساعة">
          {timeline.map((point, index) => <div key={`${point.label}-${index}`} className="flex h-full flex-col items-center justify-end gap-1"><span className="text-[10px] tabular-nums text-muted-foreground">{point.count || ''}</span><div title={`${point.label}: ${point.count} حدث`} className="w-full min-w-2 rounded-t bg-primary/70" style={{ height: `${Math.max(point.count ? 8 : 2, point.count / maxTimeline * 72)}px` }} /><span className="text-[9px] text-muted-foreground">{index % 2 === 0 ? point.label : ''}</span></div>)}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><Filter className="h-4 w-4" /> فلاتر سريعة</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} /> تجميع المتكرر حسب البصمة والصفحة</label></div>
        <div className="flex flex-wrap gap-2"><QuickFilter active={route === 'all'} onClick={() => setRoute('all')}>كل الصفحات</QuickFilter>{routeCounts.map(([path, count]) => <QuickFilter key={path} active={route === path} onClick={() => setRoute(route === path ? 'all' : path)}>{path} ({count})</QuickFilter>)}<QuickFilter active={category === 'http-server'} onClick={() => { setCategory(category === 'http-server' ? 'all' : 'http-server'); setSeverity('all'); }}>HTTP 5xx</QuickFilter><QuickFilter active={category === 'hydration'} onClick={() => { setCategory(category === 'hydration' ? 'all' : 'hydration'); setSeverity('all'); }}>Hydration</QuickFilter></div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center"><label className="relative block min-w-0 flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في الرسالة أو الصفحة أو المصدر…" className="h-10 w-full rounded-lg border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border bg-background px-2 text-sm"><option value="all">كل أنواع الأخطاء</option>{Object.entries(categoryNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-10 rounded-lg border bg-background px-2 text-sm"><option value="all">كل المستويات</option>{Object.entries(severityNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><Bug className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-medium">وضع إعادة إنتاج المشكلة</p><p className="text-xs leading-5 text-muted-foreground">يسجّل console.log كأحداث تشخيصية ويرفع حد السجل. لا يسجّل أجسام طلبات الشبكة أو قيم النماذج.</p></div></div><label className="flex shrink-0 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={reproduce} onChange={(event) => toggleReproduce(event.target.checked)} /> {reproduce ? 'مفعّل' : 'تفعيل'}</label></div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b p-4"><h2 className="font-semibold">الأحداث المسجلة <span className="text-sm font-normal text-muted-foreground">({groupedRows.length})</span></h2></div>
          <div className="max-h-[680px] divide-y overflow-y-auto">
            {groupedRows.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center"><CheckCircle2 className="h-8 w-8 text-emerald-600" /><p className="font-medium">لا توجد أحداث مطابقة</p><p className="text-sm text-muted-foreground">جرّب تغيير الفلاتر أو أعد إنتاج المشكلة.</p></div> : groupedRows.map(({ key, record, occurrences, latest }) => <button key={key} type="button" onClick={() => setSelectedId(record.id)} className={`block w-full p-4 text-right transition hover:bg-muted/60 ${selected?.id === record.id ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''}`}>
              <div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${record.severity === 'error' ? 'bg-destructive' : record.severity === 'network' ? 'bg-amber-500' : 'bg-sky-500'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{record.title}</span>{occurrences > 1 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{occurrences} مرة</span>}</div><p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{record.message}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{categoryNames[record.category] ?? record.category}</span><span dir="ltr">{record.route}</span><span>{timeLabel(latest)}</span></div></div></div>
            </button>)}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">تفاصيل الحدث</h2>{selected && <button type="button" onClick={() => void copyReport(selected)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"><Clipboard className="h-3.5 w-3.5" /> نسخ هذا الخطأ</button>}</div>
          {!selected ? <p className="py-12 text-center text-sm text-muted-foreground">اختر حدثًا من القائمة لعرض التفاصيل.</p> : <div className="space-y-4 text-sm">
            <div><p className="text-xs text-muted-foreground">الشرح</p><h3 className="mt-1 break-words font-semibold">{selected.title}</h3><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3">{selected.message}</p></div>
            <Info label="نوع الحدث" value={categoryNames[selected.category] ?? selected.category} /><Info label="المستوى" value={severityNames[selected.severity]} /><Info label="وقت الحدوث" value={timeLabel(selected.occurredAt)} /><Info label="الصفحة" value={selected.route} ltr /><Info label="المصدر" value={selected.source || 'غير متوفر'} ltr /><Info label="التكرار" value={`${selected.count} مرة`} /><Info label="الاتصال وقت الحدث" value={selected.online ? 'متصل' : 'غير متصل'} />
            {selected.details && <CodeDetails label="تفاصيل إضافية" value={selected.details} />}{selected.stack && <CodeDetails label="Stack trace" value={selected.stack} />}
            {selected.breadcrumbs?.length ? <details open className="rounded-lg border"><summary className="cursor-pointer px-3 py-2 font-semibold">آخر {selected.breadcrumbs.length} خطوة قبل الخطأ</summary><ol className="space-y-2 border-t p-3">{selected.breadcrumbs.map((crumb, index) => <li key={`${crumb.timestamp}-${index}`} className="flex gap-2"><span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">{crumb.category}</span><div className="min-w-0 flex-1"><p className="break-words">{crumb.message}</p><p className="text-[10px] text-muted-foreground">{timeLabel(crumb.timestamp)}</p>{crumb.data && <pre dir="ltr" className="mt-1 whitespace-pre-wrap break-words text-[10px] text-muted-foreground">{JSON.stringify(crumb.data)}</pre>}</div></li>)}</ol></details> : <p className="text-xs text-muted-foreground">لا توجد خطوات سابقة مسجلة لهذا الحدث.</p>}
            {selected.performance && <details className="rounded-lg border"><summary className="cursor-pointer px-3 py-2 font-semibold">لقطة الأداء وقت الخطأ</summary><pre dir="ltr" className="overflow-auto border-t bg-muted/50 p-3 text-left text-xs">{JSON.stringify(selected.performance, null, 2)}</pre></details>}
            <CodeDetails label="المتصفح والجهاز" value={selected.userAgent} />
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">التقرير محلي لهذا المتصفح. لا تُلتقط قيم الحقول أو محتويات DOM النصية أو أجسام استجابات الشبكة. قد تبقى رسائل الأخطاء نفسها حساسة؛ راجع التقرير قبل مشاركته.</p>
          </div>}
        </section>
      </div>
      <p className="text-xs leading-5 text-muted-foreground"><Layers3 className="ml-1 inline h-3.5 w-3.5" /> التخزين الأساسي IndexedDB مع مرآة احتياطية محدودة في localStorage. <Wifi className="mx-1 inline h-3.5 w-3.5" /> تتم مزامنة التحديثات بين التبويبات المفتوحة في المتصفح نفسه. <WifiOff className="mx-1 inline h-3.5 w-3.5" /> لا يجمع المركز أخطاء أجهزة المستخدمين الآخرين؛ لذلك يبقى Sentry مسؤولًا عن التجميع المركزي والتنبيهات.</p>
    </div>
  );
}

function QuickFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}>{children}</button>;
}
function Metric({ title, value, detail, danger = false }: { title: string; value: number; detail: string; danger?: boolean }) {
  return <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{title}</p><p className={`mt-2 text-3xl font-bold tabular-nums ${danger ? 'text-destructive' : ''}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
function Info({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p dir={ltr ? 'ltr' : undefined} className={`mt-1 break-all font-medium ${ltr ? 'text-left' : ''}`}>{value}</p></div>;
}
function CodeDetails({ label, value }: { label: string; value: string }) {
  return <details className="rounded-lg border"><summary className="cursor-pointer px-3 py-2 font-medium">{label}</summary><pre dir="ltr" className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t bg-muted/50 p-3 text-left text-xs">{value}</pre></details>;
}
