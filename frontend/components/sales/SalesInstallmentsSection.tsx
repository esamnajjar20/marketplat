'use client';

import { useState } from 'react';
import { useUpcomingInstallments, useOverdueInstallments } from '@/hooks/queries/useInstallments';
import { usePayInstallment } from '@/hooks/mutations/useInstallmentMutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Installment = {
  id: string;
  amount: number | string;
  paidAmount?: number | string | null;
  installmentNo: number;
  dueDate: string;
  sale?: { customer?: { name?: string } | null; buyerName?: string } | null;
};

function daysUntil(dueDate: string) {
  const due = new Date(dueDate);
  const now = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function InstallmentRow({
  row,
  onPay,
  overdue,
}: {
  row: Installment;
  onPay: (id: string, amount: number) => Promise<void>;
  overdue?: boolean;
}) {
  const remaining = Number(row.amount) - Number(row.paidAmount ?? 0);
  const [amount, setAmount] = useState(String(Math.max(0, remaining)));
  const days = daysUntil(row.dueDate);
  const name = row.sale?.customer?.name ?? row.sale?.buyerName ?? 'عميل';

  return (
    <article className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-extrabold">{name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            القسط {row.installmentNo}
            {overdue
              ? ` · استحق قبل ${Math.abs(Math.min(days, 0))} يوماً`
              : days >= 0
                ? ` · يستحق بعد ${days} أيام`
                : ''}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold',
            overdue ? 'bg-[#FBE9E7] text-[#9B2118]' : 'bg-[#FBF0D9] text-[#7A4B07]',
          )}
        >
          {overdue ? 'متأخر' : 'قادم'}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            type="number"
            min="0.01"
            max={remaining}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="مبلغ دفعة القسط"
            className="h-11 rounded-xl pe-10 font-bold tabular-nums"
          />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₪</span>
        </div>
        <Button
          className="h-11 shrink-0 rounded-xl px-5 font-bold"
          disabled={Number(amount) <= 0 || Number(amount) > remaining}
          onClick={() => void onPay(row.id, Number(amount))}
        >
          تسديد
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        المتبقي من القسط: {Math.max(0, remaining).toFixed(2)} ₪
      </p>
    </article>
  );
}

export function SalesInstallmentsSection() {
  const upcoming = useUpcomingInstallments();
  const overdue = useOverdueInstallments();
  const pay = usePayInstallment();
  const onPay = async (id: string, amount: number) => {
    await pay.mutateAsync({ id, amount });
  };

  if (upcoming.isLoading || overdue.isLoading) {
    return (
      <LoadingGate
        loading={upcoming.isLoading || overdue.isLoading}
        label="جارٍ تحميل الأقساط"
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
    );
  }

  if (upcoming.isError || overdue.isError) {
    return <div className="py-12 text-center text-destructive">تعذر تحميل الأقساط.</div>;
  }

  const overdueRows = (overdue.data ?? []) as Installment[];
  const upcomingRows = (upcoming.data ?? []) as Installment[];

  return (
    <div className="space-y-5 lg:space-y-6">
      <div>
        <h2 className="text-xl font-extrabold">الأقساط</h2>
        <p className="text-sm text-muted-foreground">تابع الأقساط المتأخرة والقادمة وسجّل ما سُدّد.</p>
      </div>

      {overdueRows.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-extrabold text-destructive">أقساط متأخرة</h3>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
          {overdueRows.map((row) => (
            <InstallmentRow key={row.id} row={row} onPay={onPay} overdue />
          ))}
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <h3 className="text-sm font-extrabold">أقساط قادمة</h3>
        {upcomingRows.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
          {upcomingRows.map((row) => <InstallmentRow key={row.id} row={row} onPay={onPay} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            لا توجد أقساط قادمة.
          </div>
        )}
      </section>
    </div>
  );
}
