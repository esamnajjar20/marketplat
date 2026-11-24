'use client';
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import type { SaleRecord, SaleTransferMethod } from '@/types/sale.types';
import { useAddSalePayment } from '@/hooks/mutations/useSaleMutations';
import { formatMoney } from '@/lib/formatters';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
export function AddPaymentDialog({ sale, open, onOpenChange }: { sale: SaleRecord; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<SaleTransferMethod>('CASH');
  const m = useAddSalePayment();
  const operationIds = useRef<Record<string, string>>({});
  const [error, setError] = useState('');
  const submit = async () => {
    const payload = { amount: Number(amount), method };
    const fingerprint = JSON.stringify(payload);
    const offlineOperationId = operationIds.current[fingerprint] ?? newOfflineOperationId();
    operationIds.current[fingerprint] = offlineOperationId;
    setError('');
    try {
      await m.mutateAsync({ id: sale.id, payload: { ...payload, offlineOperationId } });
      delete operationIds.current[fingerprint];
      setAmount('');
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تسجيل الدفعة. أعد المحاولة دون تغيير بيانات العملية.');
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl">
      <DialogHeader>
        <DialogTitle>إضافة دفعة</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">المتبقي: {formatMoney(Number(sale.dueAmount))}</div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Input type="number" min="0.01" max={sale.dueAmount} value={amount} onChange={e => setAmount(e.target.value)} placeholder="المبلغ" />
        <select value={method} onChange={e => setMethod(e.target.value as SaleTransferMethod)} className="h-10 w-full rounded-md border bg-background px-3">
          <option value="CASH">نقدي</option>
          <option value="JAWWAL_PAY">جوال باي</option>
          <option value="BANK_PALESTINE">بنك فلسطين</option>
          <option value="PALPAY">PalPay</option>
          <option value="CARD">بطاقة</option>
          <option value="OTHER">أخرى</option>
        </select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button disabled={m.isPending || Number(amount) <= 0 || Number(amount) > Number(sale.dueAmount)} loading={m.isPending} onClick={() => void submit()}>تسجيل الدفعة</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
