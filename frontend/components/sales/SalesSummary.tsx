'use client';
import type { SalesSummary as Summary } from '@/types/sale.types';
import { useSalesCostSettings } from '@/hooks/queries/useSales';
import { formatMoney } from '@/lib/formatters';
export function SalesSummary({ summary }: { summary?: Summary }) {
  const { data: costSettings } = useSalesCostSettings();
  const cards = [
    ['مبيعات الشهر', `${formatMoney((summary?.totalRevenue ?? 0))}`],
    ['المدفوع', `${formatMoney((summary?.totalPaid ?? 0))}`],
    ['الديون', `${formatMoney((summary?.totalDue ?? 0))}`],
    ...(costSettings?.enabled !== false ? [['الربح الصافي', `${formatMoney((summary?.netProfit ?? 0))}`]] : []),
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-border/70 bg-card shadow-sm p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-extrabold tracking-tight">{value}</div></div>)}</div>;
}
