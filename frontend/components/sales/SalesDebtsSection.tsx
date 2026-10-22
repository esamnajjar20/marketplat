'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { AlertTriangle, FileText } from 'lucide-react';
import { useDebts } from '@/hooks/queries/useDebts';
import { useDebtSummary } from '@/hooks/queries/useSales';
import { Button } from '@/components/ui/button';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/ui/skeleton';

export function SalesDebtsSection() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const query = useDebts({ page, limit: 20 });
  const summary = useDebtSummary();

  return (
    <div className="space-y-4 lg:space-y-5">
      <div>
        <h2 className="text-xl font-extrabold">الديون</h2>
        <p className="text-sm text-muted-foreground">المبيعات التي ما زال عليها مبلغ مستحق.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FBE9E7] text-[#9B2118]">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <span className="text-[11px] text-muted-foreground">إجمالي الدين</span>
          </div>
          <strong className="mt-1.5 block text-lg font-extrabold tabular-nums">
            {Number(summary.data?.totalDue ?? 0).toFixed(2)} ₪
          </strong>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <span className="text-[11px] text-muted-foreground">عدد المبيعات المستحقة</span>
          </div>
          <strong className="mt-1.5 block text-lg font-extrabold tabular-nums">
            {Number(summary.data?.debtorCount ?? query.data?.totalCount ?? 0).toLocaleString('ar')}
          </strong>
        </div>
      </div>

      {query.isLoading ? (
        <LoadingGate
          loading={query.isLoading}
          label="جارٍ تحميل الديون"
          fallback={
            <div className="space-y-2.5" aria-hidden="true">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          }
        >
          {null}
        </LoadingGate>
      ) : query.isError ? (
        <div className="py-12 text-center text-destructive">تعذر تحميل الديون.</div>
      ) : !query.data?.rows?.length ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          لا توجد ديون مستحقة.
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
          {query.data.rows.map((sale) => {
            const text = `مرحبًا ${sale.buyerName}، تذكير بوجود مبلغ مستحق قدره ${Number(sale.dueAmount).toFixed(2)} ₪ على الفاتورة ${sale.invoiceNumber ?? ''}.`;
            const href = sale.buyerPhone
              ? `https://wa.me/${sale.buyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
              : `https://wa.me/?text=${encodeURIComponent(text)}`;
            return (
              <article key={sale.id} className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-extrabold">{sale.buyerName}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {sale.entityTitle}
                      {sale.invoiceNumber ? ` · ${sale.invoiceNumber}` : ''}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-[11px] text-muted-foreground">المتبقي</p>
                    <strong className="text-base font-extrabold tabular-nums text-destructive">
                      {Number(sale.dueAmount).toFixed(2)} ₪
                    </strong>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="h-10 flex-1 rounded-xl font-bold"
                    onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
                  >
                    تذكير واتساب
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10 flex-1 rounded-xl font-bold"
                    onClick={() => {
                      const destination = `/account/sales/${sale.id}/receipt`;
                      signalNavigationStart(destination);
                      router.push(destination);
                    }}
                  >
                    الإيصال
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {query.data && query.data.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="صفحات الديون">
          <span className="text-sm text-muted-foreground">
            صفحة {query.data.page} من {query.data.totalPages} · {query.data.totalCount} ديون
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl font-bold"
              disabled={!query.data.hasPrevPage || query.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl font-bold"
              disabled={!query.data.hasNextPage || query.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              التالي
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
