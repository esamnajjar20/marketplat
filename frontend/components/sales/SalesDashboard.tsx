'use client';

import type { ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Package,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useSalesDashboard } from '@/hooks/queries/useSales';
import { cn } from '@/lib/utils';

const money = (n: number) =>
  `${Number(n || 0).toLocaleString('ar', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪`;

function StatTile({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: ComponentType<{ className?: string }>;  // eslint-disable-line
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            warn ? 'bg-[#FBE9E7] text-[#9B2118]' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
      </div>
      <b className="text-lg font-extrabold tabular-nums leading-none tracking-tight">{value}</b>
    </div>
  );
}

export function SalesDashboard() {
  const { data, isLoading, isError } = useSalesDashboard();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-border/70 p-6 text-center text-sm text-destructive">
        تعذر تحميل لوحة المبيعات.
      </div>
    );
  }

  const paid = Number(data.summary.totalPaid ?? 0);
  const change = data.compare.revenueChangePercentage;

  return (
    <div className="space-y-4 lg:space-y-6" dir="rtl">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <StatTile icon={TrendingUp} label="إيرادات الشهر" value={money(data.summary.totalRevenue)} />
        <StatTile icon={Wallet} label="الربح الصافي" value={money(data.summary.netProfit)} />
        <StatTile icon={CheckCircle2} label="المدفوع" value={money(paid)} />
        <StatTile icon={AlertTriangle} label="الديون" value={money(data.debt.totalDue)} warn />
      </div>

      {change !== null && (
        <section className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold">مقارنة الأداء</h3>
              <p className="text-xs text-muted-foreground">هل تتحسن مبيعاتك مع الوقت؟</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">الحالي</p>
              <p className="mt-1 text-base font-extrabold tabular-nums">{money(data.compare.current?.totalRevenue ?? data.summary.totalRevenue)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">المقارنة</p>
              <p className="mt-1 text-base font-extrabold tabular-nums text-muted-foreground">
                {money(data.compare.previous?.totalRevenue ?? 0)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">مقابل الفترة السابقة</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                change >= 0 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive',
              )}
            >
              {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(change).toFixed(1)}%
            </span>
          </div>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        <section className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold">أفضل المنتجات</h3>
            <span className="text-[11px] text-muted-foreground">حسب الإيراد</span>
          </div>
          <div className="space-y-2">
            {data.topProducts.map((x, i) => (
              <div
                key={`${x.productId ?? x.title}-${i}`}
                className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  <span className="me-1.5 text-muted-foreground">{i + 1}.</span>
                  {x.title}
                </span>
                <span className="shrink-0 font-extrabold tabular-nums">{money(x.revenue)}</span>
              </div>
            ))}
            {!data.topProducts.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold">تنبيهات المخزون</h3>
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-2">
            {data.lowStock.map((x) => (
              <div
                key={x.id}
                className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate font-medium">{x.name}</span>
                <span
                  className={cn(
                    'shrink-0 font-extrabold tabular-nums',
                    x.stockQuantity === 0 ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {x.stockQuantity ?? '∞'} وحدة
                </span>
              </div>
            ))}
            {!data.lowStock.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">لا توجد منتجات منخفضة المخزون.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
