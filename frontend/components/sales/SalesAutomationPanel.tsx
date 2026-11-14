'use client';

import { BellRing, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/shared/ui/Button';
import { salesApi } from '@/api/sales.api';
import { parseApiError } from '@/lib/errorParser';

export function SalesAutomationPanel() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ notificationsSent: number; scanned?: Record<string, number> } | null>(null);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const response = await salesApi.runAutomation();
      if (response.data.data) setResult(response.data.data);
    } catch (cause) {
      // The automation endpoint can fail while scanning several data groups.
      // A failed run must be rendered as an actionable state, not leak as an
      // unhandled promise rejection from the fire-and-forget click handler.
      const parsed = parseApiError(cause);
      setError(parsed.message);
      toast.error('تعذّر تشغيل أتمتة المبيعات', {
        description: parsed.requestId
          ? `${parsed.message} (رقم المتابعة: ${parsed.requestId})`
          : parsed.message,
      });
    } finally {
      setRunning(false);
    }
  };

  return <section className="rounded-xl border bg-card p-4" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary"/><h3 className="font-semibold">أتمتة المبيعات</h3></div><p className="mt-1 text-sm text-muted-foreground">يفحص المخزون المنخفض والديون المتأخرة والأقساط القريبة والعملاء غير النشطين دون تكرار التنبيهات.</p></div>
      <Button onClick={run} disabled={running}>{running ? 'جارٍ الفحص...' : <><Play className="ms-2 h-4 w-4"/>تشغيل الآن</>}</Button>
    </div>
    {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div><p className="font-medium">لم يكتمل الفحص.</p><p className="mt-1">{error}</p><p className="mt-1 text-xs">يمكنك إعادة المحاولة بعد التأكد من اتصال الخادم.</p></div>
    </div>}
    {result && !error && <div role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm"><CheckCircle2 className="h-4 w-4 text-primary"/>تم الفحص وإرسال {result.notificationsSent} تنبيهًا جديدًا.</div>}
  </section>;
}
