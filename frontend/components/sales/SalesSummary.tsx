'use client';
import type { SalesSummary as Summary } from '@/types/sale.types';
export function SalesSummary({ summary }: { summary?: Summary }) {
  const cards = [
    ['مبيعات الشهر', `${(summary?.totalRevenue ?? 0).toFixed(2)} ₪`],
    ['المدفوع', `${(summary?.totalPaid ?? 0).toFixed(2)} ₪`],
    ['الديون', `${(summary?.totalDue ?? 0).toFixed(2)} ₪`],
    ['الربح الصافي', `${(summary?.netProfit ?? 0).toFixed(2)} ₪`],
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold tracking-tight">{value}</div></div>)}</div>;
}
