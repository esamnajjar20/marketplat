'use client';

import { useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { useCustomers } from '@/hooks/queries/useCustomers';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function debtBadge(due: number, overdue?: boolean) {
  if (overdue || due > 0 && overdue) {
    return { label: 'متأخر', className: 'bg-[#FBE9E7] text-[#9B2118]' };
  }
  if (due > 0) {
    return { label: 'عليه دين', className: 'bg-[#FBF0D9] text-[#7A4B07]' };
  }
  return { label: 'بدون دين', className: 'bg-primary/10 text-primary' };
}

export function SalesCustomersSection() {
  const [q, setQ] = useState('');
  const query = useCustomers({ page: 1, limit: 30, q: q.trim() || undefined });
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold">العملاء</h2>
          <p className="text-sm text-muted-foreground">العملاء المرتبطون بمبيعاتك ومؤشرات الشراء والدين.</p>
        </div>
        <Button variant="outline" onClick={() => void query.refetch()} className="h-10 rounded-xl font-bold gap-1.5">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
      </div>

      <div className="relative">
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="ابحث بالاسم أو رقم الجوال…"
          aria-label="البحث في العملاء"
          className="h-11 rounded-xl"
        />
      </div>

      {query.isLoading ? (
        <LoadingGate
          loading={query.isLoading}
          label="جارٍ تحميل العملاء"
          fallback={
            <div className="space-y-2.5" aria-hidden="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          }
        >
          {null}
        </LoadingGate>
      ) : query.isError ? (
        <div className="py-12 text-center text-destructive">تعذر تحميل العملاء.</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <Users className="mx-auto h-9 w-9" />
          <p className="mt-3">لا يوجد عملاء بعد.</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
          {items.map((customer) => {
            const due = Number(customer.totalDue);
            const badge = debtBadge(due, Boolean((customer as { isOverdue?: boolean }).isOverdue));
            return (
              <article
                key={customer.id}
                className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-extrabold">{customer.name}</h3>
                    <p dir="ltr" className="mt-0.5 text-right text-xs text-muted-foreground">
                      {customer.phone || 'بدون جوال'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold',
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-[11px] text-muted-foreground">المشتريات</span>
                    <strong className="mt-0.5 block tabular-nums">{Number(customer.totalSpent).toFixed(2)} ₪</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">الدين</span>
                    <strong
                      className={cn(
                        'mt-0.5 block tabular-nums',
                        due > 0 && 'text-destructive',
                      )}
                    >
                      {due.toFixed(2)} ₪
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">العمليات</span>
                    <strong className="mt-0.5 block tabular-nums">{customer.purchaseCount}</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
