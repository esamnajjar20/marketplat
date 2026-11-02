'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ApiError } from '@/components/shared/ApiError';
import { adminApi } from '@/api/admin.api';
import { parseApiError } from '@/lib/errorParser';
import type { FraudMonitorHistoryResponse, FraudMonitorScanReport } from '@/types/admin.types';

const CHECK_LABELS: Record<string, string> = {
  REPORTER_BURST: 'اندفاع البلاغات من حساب واحد',
  REPORT_TARGET_BURST: 'تجمّع بلاغات حول هدف واحد',
  NEW_ACCOUNT_REPORT_BURST: 'بلاغات متعددة من حساب حديث',
  REPEATED_UNREVIEWED_FRAUD_SIGNALS: 'إشارات احتيال متكررة لحساب',
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ar-PS', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function sampleDetails(sample: Record<string, unknown>) {
  return Object.entries(sample)
    .filter(([key]) => key !== 'id')
    .map(([key, value]) => {
      const label: Record<string, string> = {
        reportCount: 'البلاغات', targetCount: 'الأهداف', reporterCount: 'المبلّغون',
        signalCount: 'الإشارات', adCount: 'الإعلانات', targetType: 'نوع الهدف',
        firstReportAt: 'أول بلاغ', lastReportAt: 'آخر بلاغ', accountCreatedAt: 'إنشاء الحساب',
        firstSignalAt: 'أول إشارة', lastSignalAt: 'آخر إشارة',
      };
      const rendered = typeof value === 'string' && /At$/.test(key) ? formatDate(value) : String(value);
      return `${label[key] ?? key}: ${rendered}`;
    })
    .join(' · ');
}

export function FraudMonitorPanel() {
  const [report, setReport] = useState<FraudMonitorScanReport | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<FraudMonitorHistoryResponse | null>(null);
  const [historyFailure, setHistoryFailure] = useState<unknown>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  async function loadHistory() {
    setHistoryFailure(null);
    try {
      setHistory((await adminApi.getFraudMonitorHistory()) ?? null);
    } catch (error) {
      setHistoryFailure(error);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    adminApi.getFraudMonitorHistory()
      .then(value => { if (active) setHistory(value ?? null); })
      .catch(error => { if (active) setHistoryFailure(error); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, []);

  async function runScan() {
    setPending(true);
    setFailure(null);
    try {
      const nextReport = await adminApi.runFraudMonitorScan();
      setReport(nextReport ?? null);
      await loadHistory();
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm" aria-labelledby="fraud-monitor-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <h2 id="fraud-monitor-title" className="font-semibold">مراقبة أنماط إساءة الاستخدام</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            فحص قراءة فقط للبلاغات وإشارات الاحتيال خلال النوافذ الزمنية المحددة. النتائج مؤشرات للمراجعة وليست إثباتًا للمخالفة.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void runScan()} disabled={pending} className="shrink-0 gap-2">
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" />
          {pending ? 'جارٍ الفحص…' : report ? 'إعادة الفحص' : 'بدء الفحص'}
        </Button>
      </div>

      {!!failure && <ApiError error={parseApiError(failure)} onRetry={() => void runScan()} variant="inline" />}

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">إجمالي الحالات</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{report.findingCount}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">أنماط الفحص</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{report.checkCount}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">تحذيرات</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{report.bySeverity.warning}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">حرجة</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{report.bySeverity.critical}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> آخر فحص: {formatDate(report.scannedAt)}</span>
            <span>المدة: {report.durationMillis} ms</span>
            <span>النمط: قراءة فقط</span>
          </div>

          <div className="space-y-2">
            {report.checks.map(check => (
              <article key={check.code} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{CHECK_LABELS[check.code] ?? check.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${check.count > 0 ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>
                    {check.count} حالة
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.description}</p>
                {check.samples.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                    {check.samples.map((sample, index) => (
                      <div key={`${sample.id}-${index}`} className="flex flex-col gap-1 text-xs sm:flex-row sm:items-start sm:gap-3">
                        <code dir="ltr" className="max-w-full break-all text-muted-foreground">{sample.id}</code>
                        <span className="text-muted-foreground">{sampleDetails(sample)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {check.count > check.samples.length && (
                  <p className="mt-2 text-xs text-muted-foreground">عُرضت أول {check.samples.length} عينات فقط لتقليل حجم الاستجابة.</p>
                )}
              </article>
            ))}
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            لا يؤدي هذا الفحص إلى حظر مستخدم أو تعديل بلاغ أو حذف أو إخفاء أي محتوى.
          </p>
        </div>
      )}

      <div className="space-y-3 border-t border-border/70 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">سجل الفحوصات واتجاهاتها</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              يحتفظ النظام بالمجاميع فقط لمدة {history?.retentionDays ?? 180} يومًا؛ لا تُحفظ معرّفات العينات أو نصوص البلاغات في السجل.
            </p>
          </div>
          {history?.runs[0] && <span className="text-xs text-muted-foreground">آخر تشغيل: {formatDate(history.runs[0].startedAt)}</span>}
        </div>

        {!!historyFailure && <ApiError error={parseApiError(historyFailure)} onRetry={() => void loadHistory()} variant="inline" />}
        {historyLoading ? (
          <p className="text-xs text-muted-foreground" role="status">جارٍ تحميل سجل الفحوصات…</p>
        ) : history && history.runs.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">لا يوجد سجل سابق. سيظهر هنا أول فحص يدوي أو مجدول بعد اكتماله.</p>
        ) : history && (
          <>
            {history.changes.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {history.changes.map(change => (
                  <div key={change.code} className="rounded-lg bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">{CHECK_LABELS[change.code] ?? change.code}</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {change.latestCount} حالة
                      {change.delta !== null && (
                        <span className={`ms-2 text-xs font-medium ${change.delta > 0 ? 'text-amber-700 dark:text-amber-300' : change.delta < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                          {change.delta > 0 ? `+${change.delta}` : change.delta < 0 ? String(change.delta) : 'دون تغيير'} مقارنة بالفحص السابق
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {history.runs.slice(0, 8).map(run => (
                <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {run.trigger === 'SCHEDULED' ? 'فحص يومي مجدول' : 'فحص يدوي'}
                      <span className="ms-2 text-muted-foreground">{run.status === 'COMPLETED' ? 'مكتمل' : run.status === 'FAILED' ? 'فشل' : 'قيد التنفيذ'}</span>
                    </p>
                    <p className="mt-1 text-muted-foreground">{formatDate(run.startedAt)} · {run.executionPath === 'GO' ? 'Go' : run.executionPath === 'EXPRESS' ? 'Express احتياطي' : '—'} · {run.attempts} محاولة</p>
                  </div>
                  <div className="text-end tabular-nums">
                    <p className="font-semibold">{run.findingCount} حالة</p>
                    <p className="text-muted-foreground">{run.durationMillis === null ? '—' : `${run.durationMillis} ms`}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
