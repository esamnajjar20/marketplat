'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, ReceiptText, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SalesSummary } from './SalesSummary';
import { SaleCard } from './SaleCard';
import { AddSaleDialog } from './AddSaleDialog';
import { useSales, useSalesSummary } from '@/hooks/queries/useSales';
import { salesHubTabHref } from '@/lib/salesHubTabs';

export function SalesPageClient() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useSales({ page: 1, limit: 4 });
  const { data: summary } = useSalesSummary('month');
  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">نظرة عامة</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">ملخص سريع للمبيعات والدفعات والمبالغ المستحقة.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="ms-2 h-4 w-4" />
          بيع جديد
        </Button>
      </div>

      <SalesSummary summary={summary} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div><h3 className="font-semibold">أحدث المبيعات</h3><p className="text-sm text-muted-foreground">آخر العمليات المسجلة.</p></div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={salesHubTabHref('sales')}>عرض الكل</Link>
          </Button>
        </div>
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />)}</div>
        ) : isError ? (
          <div className="rounded-xl border p-6 text-center"><p className="text-sm text-destructive">تعذر تحميل أحدث المبيعات.</p><Button className="mt-3" variant="outline" onClick={() => void refetch()}>إعادة المحاولة</Button></div>
        ) : items.length ? (
          <div className="grid gap-3 md:grid-cols-2">{items.map((sale) => <SaleCard key={sale.id} sale={sale} />)}</div>
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center"><ReceiptText className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-3 font-medium">لا توجد مبيعات بعد</p><Button className="mt-4" onClick={() => setOpen(true)}>تسجيل أول بيع</Button></div>
        )}
      </section>

      <AddSaleDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
