'use client';

import { AlertTriangle, Brain, Package, TrendingDown, TrendingUp } from 'lucide-react';
import { useSalesSmartInsights } from '@/hooks/queries/useSales';

const money = (n: number) => `${Number(n || 0).toFixed(2)} ₪`;

export function SalesSmartInsights() {
  const { data, isLoading, isError } = useSalesSmartInsights();
  if (isLoading) return <div className="h-72 animate-pulse rounded-xl border bg-muted/40" />;
  if (isError || !data) return <div className="rounded-xl border p-6 text-center text-sm text-destructive">تعذر تحميل التحليلات الذكية.</div>;
  return <section className="space-y-4" dir="rtl">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-4"><TrendingUp className="h-5 w-5 text-primary"/><div className="mt-2 text-xs text-muted-foreground">نمو 30 يوم</div><div className="text-xl font-bold">{data.kpis.revenueChange.toFixed(1)}%</div></div>
      <div className="rounded-xl border bg-card p-4"><Brain className="h-5 w-5 text-primary"/><div className="mt-2 text-xs text-muted-foreground">متوسط الفاتورة</div><div className="text-xl font-bold">{money(data.kpis.averageTicket)}</div></div>
      <div className="rounded-xl border bg-card p-4"><Package className="h-5 w-5 text-primary"/><div className="mt-2 text-xs text-muted-foreground">مخزون منخفض</div><div className="text-xl font-bold">{data.kpis.lowStockProducts}</div></div>
      <div className="rounded-xl border bg-card p-4"><AlertTriangle className="h-5 w-5 text-primary"/><div className="mt-2 text-xs text-muted-foreground">ديون متأخرة</div><div className="text-xl font-bold">{money(data.kpis.overdueAmount)}</div></div>
    </div>
    <div className="rounded-xl border bg-card p-4"><h3 className="font-semibold">توقع الإيراد لـ30 يومًا</h3><p className="mt-2 text-2xl font-bold">{money(data.forecast.next30DaysRevenue)}</p><p className="mt-1 text-xs text-muted-foreground">تقدير إحصائي مبني على معدل آخر 30 يومًا واتجاه آخر 7 أيام، وليس وعدًا بالمبيعات.</p></div>
    <div className="grid gap-3 md:grid-cols-2">{data.insights.map((x) => <article key={x.id} className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2">{x.severity === 'critical' ? <TrendingDown className="h-4 w-4 text-destructive"/> : x.severity === 'warning' ? <AlertTriangle className="h-4 w-4 text-primary"/> : <Brain className="h-4 w-4 text-primary"/>}<h3 className="font-semibold">{x.title}</h3></div><p className="mt-2 text-sm text-muted-foreground">{x.body}</p></article>)}</div>
    {!data.insights.length && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">لا توجد ملاحظات ذكية إضافية حاليًا.</div>}
  </section>;
}
