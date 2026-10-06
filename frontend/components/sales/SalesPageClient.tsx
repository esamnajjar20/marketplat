'use client';
import { useState } from 'react';
import { Plus, RefreshCw, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SalesSummary } from './SalesSummary'; import { SalesChart } from './SalesChart'; import { SalesCompareCard } from './SalesCompareCard';
import { SaleCard } from './SaleCard';
import { AddSaleDialog } from './AddSaleDialog';
import { useSales, useSalesSummary } from '@/hooks/queries/useSales';

export function SalesPageClient() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useSales({ page, limit: 12 });
  const { data: summary } = useSalesSummary('month');
  const items = data?.items ?? [];
  const filtered = search.trim() ? items.filter((s) => `${s.entityTitle} ${s.buyerName} ${s.buyerPhone ?? ''} ${s.invoiceNumber ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) : items;

  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6" dir="rtl">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><WalletCards className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">مبيعاتي</h1></div><p className="mt-1 text-sm text-muted-foreground">سجل مبيعاتك، المدفوعات والديون من مكان واحد.</p></div><Button onClick={() => setOpen(true)}><Plus className="ms-2 h-4 w-4" />بيع جديد</Button></header>
    <SalesSummary summary={summary} /><div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]"><SalesChart /><SalesCompareCard /></div>
    <section className="rounded-xl border bg-card p-4"><div className="flex flex-col gap-3 sm:flex-row"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المنتج أو العميل أو رقم الفاتورة…" /><Button variant="outline" onClick={() => void refetch()}><RefreshCw className="ms-2 h-4 w-4" />تحديث</Button></div></section>
    {isLoading ? <div className="grid gap-3 md:grid-cols-2">{Array.from({length:6}).map((_,i)=><div key={i} className="h-36 animate-pulse rounded-xl border bg-muted/40" />)}</div> : isError ? <div className="rounded-xl border p-8 text-center"><p className="text-destructive">تعذر تحميل المبيعات.</p><Button className="mt-3" variant="outline" onClick={() => void refetch()}>إعادة المحاولة</Button></div> : filtered.length ? <div className="grid gap-3 md:grid-cols-2">{filtered.map((sale) => <SaleCard key={sale.id} sale={sale} />)}</div> : <div className="rounded-xl border border-dashed p-12 text-center"><WalletCards className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-3 font-semibold">لا توجد مبيعات بعد</h2><p className="mt-1 text-sm text-muted-foreground">سجّل أول عملية بيع من زر «بيع جديد».</p><Button className="mt-4" onClick={() => setOpen(true)}><Plus className="ms-2 h-4 w-4" />تسجيل أول بيع</Button></div>}
    {data?.meta?.totalPages && data.meta.totalPages > 1 ? <div className="flex items-center justify-center gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button><span className="text-sm text-muted-foreground">صفحة {page} من {data.meta.totalPages}</span><Button variant="outline" disabled={!data.meta.hasNextPage} onClick={() => setPage((p) => p + 1)}>التالي</Button></div> : null}
    <AddSaleDialog open={open} onOpenChange={setOpen} />
  </main>;
}
