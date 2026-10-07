'use client';

import { BellRing, Play, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { salesApi } from '@/api/sales.api';

export function SalesAutomationPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ notificationsSent: number; scanned?: Record<string, number> } | null>(null);
  const run = async () => {
    setRunning(true);
    try {
      const response = await salesApi.runAutomation();
      if (response.data.data) setResult(response.data.data);
    } finally {
      setRunning(false);
    }
  };
  return <section className="rounded-xl border bg-card p-4" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary"/><h3 className="font-semibold">أتمتة المبيعات</h3></div><p className="mt-1 text-sm text-muted-foreground">يفحص المخزون المنخفض والديون المتأخرة والأقساط القريبة والعملاء غير النشطين دون تكرار التنبيهات.</p></div>
      <Button onClick={() => void run()} disabled={running}>{running ? 'جارٍ الفحص...' : <><Play className="ms-2 h-4 w-4"/>تشغيل الآن</>}</Button>
    </div>
    {result && <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm"><CheckCircle2 className="h-4 w-4 text-primary"/>تم الفحص وإرسال {result.notificationsSent} تنبيهًا جديدًا.</div>}
  </section>;
}
