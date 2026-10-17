'use client';

import { useDebts } from '@/hooks/queries/useDebts';
import { useDebtSummary } from '@/hooks/queries/useSales';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/ui/skeleton';

export function SalesDebtsSection() {
  const [page, setPage] = useState(1);
  const query = useDebts({ page, limit: 20 });
  const summary = useDebtSummary();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">الديون</h2>
        <p className="text-sm text-muted-foreground">المبيعات التي ما زال عليها مبلغ مستحق.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['إجمالي الدين', summary.data?.totalDue ?? 0], ['متأخر', summary.data?.overdueDue ?? 0], ['مستحق اليوم', summary.data?.dueToday ?? 0], ['عدد المدينين', summary.data?.debtorCount ?? 0]].map(([label,value]) => <div key={String(label)} className="rounded-xl border bg-card p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block">{label === 'عدد المدينين' ? value : `${Number(value).toFixed(2)} ₪`}</strong></div>)}</div>
      {query.isLoading ? <LoadingGate loading={query.isLoading} label="جارٍ تحميل الديون" fallback={<div className="grid gap-3 md:grid-cols-2" aria-hidden="true">{Array.from({length:4},(_,i)=><Skeleton key={i} className="h-28 rounded-xl" />)}</div>}>{null}</LoadingGate> :
       query.isError ? <div className="py-12 text-center text-destructive">تعذر تحميل الديون.</div> :
       !query.data?.rows?.length ? <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد ديون مستحقة.</div> :
       <div className="grid gap-3 md:grid-cols-2">
         {query.data.rows.map((sale) => {
           const text = `مرحبًا ${sale.buyerName}، تذكير بوجود مبلغ مستحق قدره ${Number(sale.dueAmount).toFixed(2)} ₪ على الفاتورة ${sale.invoiceNumber ?? ''}.`;
           const href = sale.buyerPhone
             ? `https://wa.me/${sale.buyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
             : `https://wa.me/?text=${encodeURIComponent(text)}`;
           return (
             <article key={sale.id} className="rounded-xl border bg-card p-4">
               <div className="flex items-start justify-between gap-3">
                 <div><h3 className="font-semibold">{sale.buyerName}</h3><p className="text-sm text-muted-foreground">{sale.entityTitle} · {sale.invoiceNumber ?? 'بدون فاتورة'}</p></div>
                 <strong>{Number(sale.dueAmount).toFixed(2)} ₪</strong>
               </div>
               <div className="mt-4 flex flex-wrap gap-2">
                 <Button size="sm" onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>تذكير واتساب</Button>
                 <Button size="sm" variant="outline" onClick={() => window.location.assign(`/account/sales/${sale.id}/receipt`)}>الإيصال</Button>
               </div>
             </article>
           );
         })}
       </div>}
      {query.data && query.data.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="صفحات الديون">
          <span className="text-sm text-muted-foreground">صفحة {query.data.page} من {query.data.totalPages} · {query.data.totalCount} دينًا</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!query.data.hasPrevPage || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>السابق</Button>
            <Button variant="outline" size="sm" disabled={!query.data.hasNextPage || query.isFetching} onClick={() => setPage((current) => current + 1)}>التالي</Button>
          </div>
        </nav>
      )}
    </div>
  );
}
