'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, Download, RefreshCw, Search, Trash2, Wifi, WifiOff } from 'lucide-react';
import { clearDeviceErrors, DEVICE_ERRORS_EVENT, getDeviceErrors, type DeviceErrorRecord } from '@/lib/deviceErrorMonitor';

const categoryNames: Record<string, string> = {
  runtime: 'خطأ JavaScript', promise: 'وعد غير معالج', hydration: 'تعارض Hydration / React',
  console: 'خطأ سجّله التطبيق', 'resource-load': 'فشل تحميل ملف', 'network-request': 'فشل طلب شبكة',
  'http-server': 'خطأ من الخادم (HTTP 5xx)', connectivity: 'حالة الاتصال',
};
const severityNames = { error: 'خطأ', warning: 'تنبيه', network: 'شبكة' } as const;
const timeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-PS', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
};

export function AdminDeviceErrorsPanel() {
  const [records, setRecords] = useState<DeviceErrorRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => setRecords(getDeviceErrors()), []);
  useEffect(() => {
    refresh();
    window.addEventListener(DEVICE_ERRORS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DEVICE_ERRORS_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((item) => (category === 'all' || item.category === category)
      && (severity === 'all' || item.severity === severity)
      && (!needle || [item.title, item.message, item.route, item.source, item.stack, item.details, item.category].some((part) => part?.toLowerCase().includes(needle))));
  }, [records, query, category, severity]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const errorCount = records.filter((item) => item.severity === 'error').length;
  const networkCount = records.filter((item) => item.severity === 'network').length;

  const copyReport = async (item?: DeviceErrorRecord) => {
    const text = JSON.stringify(item ?? { generatedAt: new Date().toISOString(), scope: 'this browser profile only', count: records.length, records }, null, 2);
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt('انسخ التقرير يدويًا:', text); }
  };
  const downloadReport = () => {
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'this browser profile only', records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `marketplat-device-errors-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const clearAll = () => {
    if (window.confirm('هل تريد حذف سجل الأخطاء المحلي من هذا المتصفح؟ لا يمكن التراجع عن ذلك.')) { clearDeviceErrors(); setSelectedId(null); refresh(); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <header className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><AlertTriangle className="h-5 w-5" /></span>
          <div><h1 className="text-xl font-bold">مركز أخطاء هذا الجهاز</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">يجمع أخطاء JavaScript وReact، والوعود غير المعالجة، وفشل تحميل الملفات وطلبات الشبكة وأخطاء HTTP 5xx. السجل محلي في هذا المتصفح ولا يُرسل إلى الخادم.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" /> تحديث</button>
          <button type="button" onClick={() => void copyReport()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Clipboard className="h-4 w-4" /> {copied ? 'تم النسخ' : 'نسخ التقرير'}</button>
          <button type="button" onClick={downloadReport} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" /> تنزيل JSON</button>
          <button type="button" onClick={clearAll} className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/30 px-3 text-sm text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /> مسح السجل</button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric title="إجمالي الأحداث المحفوظة" value={records.length} detail="آخر 300 حدث كحد أقصى" />
        <Metric title="أخطاء تحتاج فحصًا" value={errorCount} detail="تشغيل React/JavaScript أو HTTP 5xx" danger={errorCount > 0} />
        <Metric title="أحداث الشبكة" value={networkCount} detail="انقطاع، فشل طلب، أو مورد" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="space-y-3 border-b p-4">
            <h2 className="font-semibold">الأحداث المسجلة</h2>
            <label className="relative block"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في الرسالة أو الصفحة أو المصدر…" className="h-10 w-full rounded-lg border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
            <div className="grid grid-cols-2 gap-2"><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 min-w-0 rounded-lg border bg-background px-2 text-sm"><option value="all">كل أنواع الأخطاء</option>{Object.entries(categoryNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-9 min-w-0 rounded-lg border bg-background px-2 text-sm"><option value="all">كل المستويات</option>{Object.entries(severityNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          </div>
          <div className="max-h-[620px] overflow-y-auto divide-y">
            {filtered.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center"><CheckCircle2 className="h-8 w-8 text-emerald-600" /><p className="font-medium">لا توجد أحداث مطابقة</p><p className="text-sm text-muted-foreground">{records.length ? 'جرّب تغيير عوامل التصفية.' : 'ستظهر هنا الأخطاء التي تحدث في هذا المتصفح بعد تفعيل المراقبة.'}</p></div> : filtered.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`block w-full p-4 text-right transition hover:bg-muted/60 ${selected?.id === item.id ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''}`}>
              <div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === 'error' ? 'bg-destructive' : item.severity === 'network' ? 'bg-amber-500' : 'bg-sky-500'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-sm">{item.title}</span>{item.count > 1 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">تكرر {item.count}×</span>}</div><p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{item.message}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{categoryNames[item.category] ?? item.category}</span><span dir="ltr">{item.route}</span><span>{timeLabel(item.occurredAt)}</span></div></div></div>
            </button>)}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">تفاصيل الحدث</h2>{selected && <button type="button" onClick={() => void copyReport(selected)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">نسخ هذا الخطأ</button>}</div>
          {!selected ? <p className="py-12 text-center text-sm text-muted-foreground">اختر حدثًا من القائمة لعرض التفاصيل.</p> : <div className="space-y-4 text-sm">
            <div><p className="text-xs text-muted-foreground">الشرح</p><h3 className="mt-1 break-words font-semibold">{selected.title}</h3><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3">{selected.message}</p></div>
            <Info label="نوع الحدث" value={categoryNames[selected.category] ?? selected.category} /><Info label="المستوى" value={severityNames[selected.severity]} /><Info label="وقت الحدوث" value={timeLabel(selected.occurredAt)} /><Info label="الصفحة" value={selected.route} ltr /><Info label="المصدر" value={selected.source || 'غير متوفر'} ltr />
            {(selected.line || selected.column) && <Info label="الموضع" value={`السطر ${selected.line ?? '؟'}، العمود ${selected.column ?? '؟'}`} />}
            <Info label="الاتصال وقت الحدث" value={selected.online ? 'متصل' : 'غير متصل'} />
            {selected.details && <CodeDetails label="تفاصيل إضافية" value={selected.details} />}
            {selected.stack && <CodeDetails label="Stack trace" value={selected.stack} />}
            <CodeDetails label="المتصفح والجهاز" value={selected.userAgent} />
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">قد لا يمكن تحديد اسم المكوّن من كل خطأ، خصوصًا إذا كان الكود مضغوطًا أو الخطأ صادرًا من الخادم. انسخ التقرير مع مسار الصفحة لتسهيل تتبّع المصدر.</p>
          </div>}
        </section>
      </div>
      <p className="text-xs leading-5 text-muted-foreground"><Wifi className="ml-1 inline h-3.5 w-3.5" /> النطاق: هذا المتصفح/ملف المستخدم فقط. <WifiOff className="mx-1 inline h-3.5 w-3.5" /> لا يجمع هذا المركز أخطاء أجهزة المستخدمين الآخرين ولا سجلات الخادم الداخلية؛ ذلك يتطلب خدمة مراقبة مركزية منفصلة.</p>
    </div>
  );
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
