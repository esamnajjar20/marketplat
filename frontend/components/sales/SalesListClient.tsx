'use client';

import { useState } from 'react';
import { Plus, RefreshCw, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SaleCard } from './SaleCard';
import { AddSaleDialog } from './AddSaleDialog';
import { useSales } from '@/hooks/queries/useSales';

export function SalesListClient() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useSales({ page, limit: 12 });
  const items = data?.items ?? [];
  const query = search.trim().toLowerCase();
  const filtered = query
    ? items.filter((sale) =>
        `${sale.entityTitle} ${sale.buyerName} ${sale.buyerPhone ?? ''} ${sale.invoiceNumber ?? ''}`
          .toLowerCase()
          .includes(query),
      )
    : items;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">سجل المبيعات</h2>
          <p className="text-sm text-muted-foreground">راجع عمليات البيع والدفعات والإيصالات.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="ms-2 h-4 w-4" />
          بيع جديد
        </Button>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="ابحث باسم المنتج أو العميل أو رقم الفاتورة…"
            aria-label="البحث في المبيعات"
          />
          <Button variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="ms-2 h-4 w-4" />
            تحديث
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border p-8 text-center">
          <p className="text-destructive">تعذر تحميل المبيعات.</p>
          <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((sale) => <SaleCard key={sale.id} sale={sale} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <WalletCards className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">لا توجد مبيعات مطابقة</h3>
          <p className="mt-1 text-sm text-muted-foreground">سجّل عملية بيع جديدة أو غيّر عبارة البحث.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            <Plus className="ms-2 h-4 w-4" />
            تسجيل بيع
          </Button>
        </div>
      )}

      {data?.meta?.totalPages && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {data.meta.totalPages}</span>
          <Button variant="outline" disabled={!data.meta.hasNextPage} onClick={() => setPage((value) => value + 1)}>
            التالي
          </Button>
        </div>
      ) : null}

      <AddSaleDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
