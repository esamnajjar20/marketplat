'use client';

import { useState } from 'react';
import { useUpcomingInstallments, useOverdueInstallments } from '@/hooks/queries/useInstallments';
import { usePayInstallment } from '@/hooks/mutations/useInstallmentMutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Installment = {
  id: string;
  amount: number | string;
  paidAmount?: number | string | null;
  installmentNo: number;
  dueDate: string;
  sale?: { customer?: { name?: string } | null; buyerName?: string } | null;
};

function InstallmentRow({ row, onPay }: { row: Installment; onPay: (id: string, amount: number) => Promise<void> }) {
  const remaining = Number(row.amount) - Number(row.paidAmount ?? 0);
  const [amount, setAmount] = useState(String(Math.max(0, remaining)));
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><strong>{row.sale?.customer?.name ?? row.sale?.buyerName ?? 'عميل'}</strong><p className="text-sm text-muted-foreground">قسط {row.installmentNo} · استحقاق {new Date(row.dueDate).toLocaleDateString('ar-PS', { timeZone: 'Asia/Gaza' })}</p></div>
        <strong>{Math.max(0, remaining).toFixed(2)} ₪</strong>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input type="number" min="0.01" max={remaining} value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="مبلغ دفعة القسط" />
        <Button disabled={Number(amount) <= 0 || Number(amount) > remaining} onClick={() => void onPay(row.id, Number(amount))}>دفع القسط</Button>
      </div>
    </article>
  );
}

function Group({ title, rows, onPay }: { title: string; rows: Installment[]; onPay: (id: string, amount: number) => Promise<void> }) {
  return <section className="space-y-3"><h3 className="font-semibold">{title}</h3>{rows.length ? rows.map((row) => <InstallmentRow key={row.id} row={row} onPay={onPay} />) : <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">لا توجد أقساط.</div>}</section>;
}

export function SalesInstallmentsSection() {
  const upcoming = useUpcomingInstallments();
  const overdue = useOverdueInstallments();
  const pay = usePayInstallment();
  const onPay = async (id: string, amount: number) => { await pay.mutateAsync({ id, amount }); };

  if (upcoming.isLoading || overdue.isLoading) return <div className="py-12 text-center text-muted-foreground">جارٍ تحميل الأقساط…</div>;
  if (upcoming.isError || overdue.isError) return <div className="py-12 text-center text-destructive">تعذر تحميل الأقساط.</div>;

  return <div className="space-y-6"><div><h2 className="text-xl font-bold">الأقساط</h2><p className="text-sm text-muted-foreground">تابع الأقساط القادمة والمتأخرة وسجّل الدفعات.</p></div><Group title="متأخرة" rows={(overdue.data ?? []) as Installment[]} onPay={onPay} /><Group title="قادمة" rows={(upcoming.data ?? []) as Installment[]} onPay={onPay} /></div>;
}
