'use client';
import { useMemo, useState } from 'react';
import { useSalesChart } from '@/hooks/queries/useSales';

export function SalesChart() {
  const [period, setPeriod] = useState<'day'|'week'|'month'>('day');
  const { data = [], isLoading, isError } = useSalesChart(period);
  const points = useMemo(() => data.slice(-30), [data]);
  const max = Math.max(1, ...points.map(p => Math.max(p.revenue, p.due, p.paid)));
  const width = 720, height = 230, padX = 24, padY = 20;
  const x = (i:number) => padX + (points.length <= 1 ? 0 : i * (width - padX*2) / (points.length-1));
  const y = (v:number) => height-padY - (v/max)*(height-padY*2);
  const line = (key:'revenue'|'due'|'paid') => points.map((p,i)=>`${x(i)},${y(Number(p[key]))}`).join(' ');
  return <section className="rounded-xl border bg-card p-4" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">أداء المبيعات</h2><p className="text-xs text-muted-foreground">آخر 30 فترة متاحة</p></div><div className="flex rounded-lg border p-1">{(['day','week','month'] as const).map(v=><button key={v} type="button" onClick={()=>setPeriod(v)} className={`rounded-md px-3 py-1.5 text-xs ${period===v?'bg-primary text-primary-foreground':''}`}>{v==='day'?'يومي':v==='week'?'أسبوعي':'شهري'}</button>)}</div></div>
    {isLoading ? <div className="h-56 animate-pulse rounded-lg bg-muted/40"/> : isError ? <p className="py-12 text-center text-sm text-destructive">تعذر تحميل الرسم البياني.</p> : points.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">لا توجد بيانات كافية بعد.</p> : <>
      <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img" aria-label="رسم بياني للمبيعات"><line x1={padX} y1={height-padY} x2={width-padX} y2={height-padY} stroke="currentColor" opacity=".15"/><polyline className="text-emerald-600" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={line('revenue')}/><polyline className="text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 5" opacity=".75" points={line('paid')}/><polyline className="text-red-600" fill="none" stroke="currentColor" strokeWidth="2" opacity=".65" points={line('due')}/></svg></div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span>— الإيرادات</span><span>— المدفوع</span><span>— الديون</span></div>
    </>}
  </section>;
}
