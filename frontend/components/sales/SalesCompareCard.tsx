'use client';
import { useState } from 'react';
import { useSalesCompare } from '@/hooks/queries/useSales';
import { CARD_SHELL } from '@/components/shared/cards/cardTokens';

function Row({
  label,
  current,
  previous,
  pct,
}: {
  label: string;
  current: number;
  previous: number;
  pct: number | null;
}) {
  const up = (pct ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border/70 bg-card p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-destructive'}`}>
          {pct == null ? 'لا توجد مقارنة' : `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-2xs text-muted-foreground">الحالي</p>
          <p className="font-bold">{current.toFixed(2)} ₪</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">المقارنة</p>
          <p className="font-bold">{previous.toFixed(2)} ₪</p>
        </div>
      </div>
    </div>
  );
}

export function SalesCompareCard() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const { data, isLoading, isError } = useSalesCompare(period);

  if (isLoading) return <div role="status" aria-label="جارٍ تحميل مقارنة الأداء" className="h-64 animate-pulse rounded-2xl border border-border/70 bg-muted/40" />;

  // Defensive: any of current/previous/samePeriodLastYear may be missing
  // for a new user or when the backend returns partial data.
  const currentRevenue = Number(data?.current?.totalRevenue ?? 0);
  const previousRevenue = Number(data?.previous?.totalRevenue ?? 0);
  const lastYearRevenue = Number(data?.samePeriodLastYear?.totalRevenue ?? 0);
  const revPct = data?.revenueChangePercentage ?? null;
  const lastYearPct = data?.lastYearRevenueChangePercentage ?? null;

  if (isError || !data) {
    return (
      <section className={`${CARD_SHELL} p-4 text-sm text-muted-foreground sm:p-6`}>
        تعذر تحميل المقارنة.
      </section>
    );
  }

  return (
    <section className={`${CARD_SHELL} p-3 sm:p-4`} dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">مقارنة الأداء</h2>
          <p className="text-xs text-muted-foreground">هل تتحسن مبيعاتك مع الوقت؟</p>
        </div>
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
        >
          <option value="week">الأسبوع</option>
          <option value="month">الشهر</option>
          <option value="year">السنة</option>
        </select>
      </div>
      <div className="mt-3 space-y-2 sm:mt-4">
        <Row
          label="مقابل الفترة السابقة"
          current={currentRevenue}
          previous={previousRevenue}
          pct={revPct}
        />
        <Row
          label="مقابل نفس الفترة العام الماضي"
          current={currentRevenue}
          previous={lastYearRevenue}
          pct={lastYearPct}
        />
      </div>
    </section>
  );
}
