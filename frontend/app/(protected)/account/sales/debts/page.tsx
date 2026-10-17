'use client';
import { useState } from 'react';
import { useDebts } from '@/hooks/queries/useDebts';
import { Button } from '@/components/ui/button';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/ui/skeleton';

export default function DebtsPage() {
  const [page, setPage] = useState(1);
  const query = useDebts({ page, limit: 20 });
  const result = query.data;
  const rows = result?.rows ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6" dir="rtl">
      <header><h1 className="text-2xl font-bold">الديون</h1><p className="text-sm text-muted-foreground">المبيعات التي ما زال عليها مبلغ مستحق.</p></header>
      {query.isLoading ? <LoadingGate loading={query.isLoading} label="جارٍ تحميل الديون" fallback={<div className="grid gap-3 md:grid-cols-2" aria-hidden="true">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-28 rounded-xl" />)}</div>}>{null}</LoadingGate> : query.isError ? <div className="text-destructive">تعذر تحميل الديون.</div> : !rows.length ? <div className="rounded-xl border border-dashed p-10 text-center">لا توجد ديون مستحقة.</div> : (
        <div className="grid gap-3 md:grid-cols-2">{rows.map((sale) => {
          const text = `مرحبًا ${sale.buyerName}، تذكير بوجود مبلغ مستحق قدره ${Number(sale.dueAmount).toFixed(2)} ₪ على الفاتورة ${sale.invoiceNumber ?? ''}.`;
          const href = sale.buyerPhone ? `https://wa.me/${sale.buyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
          return <article key={sale.id} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{sale.buyerName}</h2><p className="text-sm text-muted-foreground">{sale.entityTitle} · {sale.invoiceNumber ?? 'بدون فاتورة'}</p></div><strong>{Number(sale.dueAmount).toFixed(2)} ₪</strong></div><div className="mt-4 flex gap-2"><Button size="sm" onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>تذكير واتساب</Button><Button size="sm" variant="outline" onClick={() => window.location.assign(`/account/sales/${sale.id}/receipt`)}>الإيصال</Button></div></article>;
        })}</div>
      )}
      {result && result.totalPages > 1 && <nav className="flex items-center justify-between gap-3" aria-label="صفحات الديون"><span className="text-sm text-muted-foreground">صفحة {result.page} من {result.totalPages} · {result.totalCount} دينًا</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!result.hasPrevPage || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>السابق</Button><Button variant="outline" size="sm" disabled={!result.hasNextPage || query.isFetching} onClick={() => setPage((current) => current + 1)}>التالي</Button></div></nav>}
    </main>
  );
}
