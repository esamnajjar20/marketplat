'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { useDebts } from '@/hooks/queries/useDebts';
import { Button } from '@/components/shared/ui/Button';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { openExternal } from '@/lib/openExternal';
import { formatMoney } from '@/lib/formatters';

export default function DebtsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [openingReceiptId, setOpeningReceiptId] = useState<string | null>(null);
  const query = useDebts({ page, limit: 20 });
  const result = query.data;
  const rows = result?.debts?.rows ?? [];
  const listFailed = result?.failures.debts ?? false;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold">الديون</h1>
        <p className="text-sm text-muted-foreground">المبيعات التي ما زال عليها مبلغ مستحق.</p>
      </header>
      {query.isLoading ? <LoadingGate loading={query.isLoading} label="جارٍ تحميل الديون" fallback={<div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>}>
        {null}
      </LoadingGate> : (query.isError || listFailed) ? <div className="text-destructive">تعذر تحميل الديون.</div> : !rows.length ? <div className="rounded-xl border border-dashed p-10 text-center">لا توجد ديون مستحقة.</div> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((sale) => {
            const text = `مرحبًا ${sale.buyerName}، تذكير بوجود مبلغ مستحق قدره ${formatMoney(Number(sale.dueAmount))} على الفاتورة ${sale.invoiceNumber ?? ''}.`;
            const href = buildWhatsAppUrl({ phone: sale.buyerPhone, text });
            return <article key={sale.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    {sale.buyerName}
                  </h2>
                  <p className="text-sm text-muted-foreground">{sale.entityTitle} · {sale.invoiceNumber ?? 'بدون فاتورة'}</p>
                </div>
                <strong>{formatMoney(Number(sale.dueAmount))}</strong>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => openExternal(href)}>تذكير واتساب</Button>
                <Button size="sm" variant="outline" disabled={openingReceiptId !== null} onClick={() => {
                  if (openingReceiptId) return;
                  const destination = `/account/sales/${sale.id}/receipt`;
                  setOpeningReceiptId(sale.id);
                  signalNavigationStart(destination);
                  router.push(destination);
                }}>الإيصال</Button>
              </div>
            </article>;
          })}
        </div>
      )}
      {result?.debts && result.debts.totalPages > 1 && <nav className="flex items-center justify-between gap-3" aria-label="صفحات الديون">
        <span className="text-sm text-muted-foreground">صفحة {result.debts.page} من {result.debts.totalPages} · {result.debts.totalCount} دينًا</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!result.debts.hasPrevPage || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>السابق</Button>
          <Button variant="outline" size="sm" disabled={!result.debts.hasNextPage || query.isFetching} onClick={() => setPage((current) => current + 1)}>التالي</Button>
        </div>
      </nav>}
    </main>
  );
}
