'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { adminApi, type AdminDataIntegrityReport } from '@/api/admin.api';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} ث`;
}

function SeverityLabel({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const labels = { critical: 'حرج', warning: 'تحذير', info: 'معلومة' };
  const styles = {
    critical: 'bg-destructive/10 text-destructive',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[severity]}`}>{labels[severity]}</span>;
}

export function AdminDataIntegrityPanel() {
  const [report, setReport] = useState<AdminDataIntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.scanDataIntegrity();
      setReport(response.data.data);
    } catch {
      setError('تعذّر تنفيذ الفحص. تحقق من تشغيل Go Worker واتصال قاعدة البيانات ثم أعد المحاولة. لم يتم تعديل أي بيانات.');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const issueChecks = report?.checks.filter(check => check.count > 0) ?? [];
  const healthyChecks = report ? report.checkCount - issueChecks.length : 0;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h3 className="font-semibold">فحص اتساق بيانات المنصة</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">فحص مباشر للبيانات التجارية والعلاقات والحالات. العملية للقراءة فقط؛ لا تصلح أو تحذف أي سجل.</p>
          </div>
        </div>
        <button type="button" onClick={() => void runScan()} disabled={loading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'جارٍ الفحص…' : report ? 'إعادة الفحص' : 'بدء الفحص'}
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">{error}</div>}

      {!report && !loading && !error && (
        <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">لم يتم تشغيل فحص سلامة البيانات في هذه الجلسة. اضغط «بدء الفحص» لبدء فحص مباشر.</div>
      )}

      {loading && !report && <div className="rounded-xl border p-5 text-center text-sm text-muted-foreground" aria-live="polite">يجري Go فحوصًا محدودة ضمن معاملة قراءة فقط. قد يستغرق الفحص وقتًا بحسب حجم قاعدة البيانات.</div>}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">إجمالي النتائج</p><p className="mt-1 text-2xl font-semibold tabular-nums">{report.findingCount}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">حرجة</p><p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">{report.bySeverity.critical}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">تحذيرات</p><p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{report.bySeverity.warning}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">معلومات</p><p className="mt-1 text-2xl font-semibold tabular-nums text-sky-700 dark:text-sky-300">{report.bySeverity.info}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">فحوص بلا نتائج</p><p className="mt-1 text-2xl font-semibold tabular-nums">{healthyChecks}/{report.checkCount}</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>وقت الفحص: {new Date(report.scannedAt).toLocaleString('ar-PS')}</span>
            <span>المدة: {formatDuration(report.durationMillis)}</span>
            <span>المحرك: Go</span>
            <span>الوضع: قراءة فقط</span>
          </div>

          {report.findingCount === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div><p className="font-semibold text-emerald-700 dark:text-emerald-300">لم تُكتشف مخالفات ضمن القواعد الحالية</p><p className="mt-1 text-sm text-muted-foreground">هذا لا يثبت خلو كل أنظمة المنصة من المشاكل؛ النتيجة تقتصر على الفحوص المعروضة.</p></div>
            </div>
          ) : (
            <div className="space-y-3">
              {issueChecks.map(check => (
                <article key={check.code} className="rounded-xl border p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityLabel severity={check.severity} />
                    <span className="text-xs text-muted-foreground">{check.entityType}</span>
                    <span className="mr-auto rounded-md bg-muted px-2 py-1 text-xs font-mono" dir="ltr">{check.count}</span>
                  </div>
                  <h4 className="mt-2 font-semibold">{check.title}</h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{check.description}</p>
                  {check.samples.length > 0 && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">عينات محدودة (حتى 10 سجلات)</p>
                      <div className="flex flex-wrap gap-2">
                        {check.samples.map(sample => <code key={sample.id} dir="ltr" className="max-w-full break-all rounded-md bg-muted px-2 py-1 text-xs">{sample.id}</code>)}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-dashed p-3 text-xs leading-5 text-muted-foreground">
            <AlertTriangle className="ml-1 inline h-3.5 w-3.5" /> النتائج إشارات تدقيق وليست أوامر إصلاح. راجع السجل الأصلي وسياق المعاملة قبل أي تعديل يدوي. إذا تعذر أحد الاستعلامات فلن يعتمد Go تقريرًا جزئيًا على أنه فحص مكتمل.
          </div>
        </>
      )}
    </div>
  );
}
