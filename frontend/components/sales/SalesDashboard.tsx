'use client';
import { AlertTriangle, ArrowDown, ArrowUp, CreditCard, Package, TrendingUp, Wallet } from 'lucide-react';
import { useSalesDashboard } from '@/hooks/queries/useSales';

const money=(n:number)=>`${Number(n||0).toFixed(2)} ₪`;
export function SalesDashboard(){
 const {data,isLoading,isError}=useSalesDashboard();
 if(isLoading) return <div className="grid gap-4 lg:grid-cols-4">{Array.from({length:4}).map((_,i)=><div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/40"/>)}</div>;
 if(isError||!data) return <div className="rounded-xl border p-6 text-center text-sm text-destructive">تعذر تحميل لوحة الإدارة.</div>;
 const cards=[['إيرادات الشهر',money(data.summary.totalRevenue),TrendingUp],['الربح الصافي',money(data.summary.netProfit),Wallet],['المبالغ المستحقة',money(data.debt.totalDue),CreditCard],['المتأخر',money(data.debt.overdueDue),AlertTriangle]] as const;
 return <div className="space-y-4" dir="rtl">
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,value,Icon])=><div key={label} className="rounded-xl border bg-card p-4 shadow-xs"><Icon className="h-5 w-5 text-primary"/><div className="mt-3 text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>)}</div>
  <div className="grid gap-4 lg:grid-cols-2">
   <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">أفضل المنتجات</h3><span className="text-xs text-muted-foreground">حسب الإيراد</span></div><div className="space-y-2">{data.topProducts.map((x,i)=><div key={`${x.productId??x.title}-${i}`} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{i+1}. {x.title}</span><span className="font-semibold">{money(x.revenue)}</span></div>)}{!data.topProducts.length&&<p className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات.</p>}</div></section>
   <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">تنبيهات المخزون</h3><Package className="h-5 w-5 text-primary"/></div><div className="space-y-2">{data.lowStock.map(x=><div key={x.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"><span>{x.name}</span><span className={x.stockQuantity===0?'font-bold text-destructive':'font-semibold'}>{x.stockQuantity ?? '∞'} وحدة</span></div>)}{!data.lowStock.length&&<p className="py-6 text-center text-sm text-muted-foreground">لا توجد منتجات منخفضة المخزون.</p>}</div></section>
  </div>
  <section className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2"><span className="font-semibold">مقارنة الشهر</span>{data.compare.revenueChangePercentage!==null&&(data.compare.revenueChangePercentage>=0?<ArrowUp className="h-4 w-4 text-primary"/>:<ArrowDown className="h-4 w-4 text-destructive"/>)}<span className="text-sm">{data.compare.revenueChangePercentage===null?'لا توجد فترة سابقة للمقارنة':`${data.compare.revenueChangePercentage.toFixed(1)}%`}</span></div></section>
 </div>;
}
