'use client';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useReturnSale } from '@/hooks/mutations/useSaleMutations';
import type { SaleRecord } from '@/types/sale.types';
import { formatMoney } from '@/lib/formatters';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
const reasons = [['DAMAGED', 'معطوب'], ['WRONG_ITEM', 'صنف خاطئ'], ['NOT_LIKED', 'لم يعجبه'], ['LATE', 'متأخر'], ['OTHER', 'أخرى']] as const;
export function ReturnSaleDialog({ sale, open, onOpenChange }: { sale: SaleRecord; open: boolean; onOpenChange: (v: boolean) => void }) {
  const items = sale.items?.length ? sale.items : [{ id: 'legacy', title: sale.entityTitle, quantity: sale.quantity, returnedQuantity: (sale.returns ?? []).reduce((s, r) => s + Number(r.quantity), 0), unitPrice: sale.unitPrice } as any];
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const item = items.find(x => x.id === itemId) ?? items[0];
  const max = Math.max(0, Number(item?.quantity ?? 0) - Number(item?.returnedQuantity ?? 0));
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<typeof reasons[number][0]>('DAMAGED');
  const [refund, setRefund] = useState('');
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [error, setError] = useState('');
  const operationIds = useRef<Record<string, string>>({});
  const mutation = useReturnSale();
  useEffect(() => {
    if (open) {
      const first = items[0];
      setItemId(first?.id ?? '');
      setQty(1);
      const firstUnitValue = first ? Number(first.lineTotal ?? sale.totalPrice) / Math.max(1, first.quantity) : Number(sale.unitPrice);
      setRefund(firstUnitValue.toFixed(2));
      setReason('DAMAGED');
      setNote('');
      setRestock(true)
    }
  }, [open, sale]);
  const auto = useMemo(() => {
    if (!item) return 0;
    const returnedQty = Number(item.returnedQuantity ?? 0);
    const priorItemRefunds = (sale.returns ?? [])
      .filter((entry) => entry.itemId === item.id)
      .reduce((sum, entry) => sum + Number(entry.refundAmount ?? 0), 0);
    const lineTotal = Number(item.lineTotal ?? sale.totalPrice);
    const itemRefundable = Math.max(0, lineTotal * (returnedQty + Math.max(0, qty)) / Math.max(1, item.quantity) - priorItemRefunds);
    const saleRefundable = Math.max(0, Number(sale.totalPrice) - Number(sale.refundedAmount ?? 0));
    return Math.round(Math.min(itemRefundable, saleRefundable) * 100) / 100;
  }, [sale, qty, item]);
  const submit = async () => {
    const payload = {
      ...(item?.id !== 'legacy' && item?.id ? { itemId: item.id } : {}),
      quantity: qty, refundAmount: Number(refund), reason,
      ...(note.trim() ? { reasonNote: note.trim() } : {}),
      restockedToInventory: restock,
    };
    const fingerprint = JSON.stringify(payload);
    const offlineOperationId = operationIds.current[fingerprint] ?? newOfflineOperationId();
    operationIds.current[fingerprint] = offlineOperationId;
    setError('');
    try {
      await mutation.mutateAsync({ id: sale.id, payload: { ...payload, offlineOperationId } });
      delete operationIds.current[fingerprint];
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تسجيل المرتجع. أعد المحاولة دون تغيير بيانات العملية.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>تسجيل مرتجع</DialogTitle>
          <DialogDescription>{sale.invoiceNumber ?? sale.entityTitle}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {items.length > 1 ? <label className="block text-sm">الصنف<select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={itemId} onChange={e => {
            setItemId(e.target.value);
            const next = items.find(x => x.id === e.target.value);
            setQty(1);
            setRefund((Number(next?.lineTotal ?? 0) / Math.max(1, Number(next?.quantity ?? 1))).toFixed(2))
          }}>
            {items.map(x => <option key={x.id} value={x.id}>{x.title} · المتاح للمرتجع {Math.max(0, x.quantity - x.returnedQuantity)}</option>)}
          </select></label> : null}
          <label className="block text-sm">الكمية<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" type="number" min={1} max={max} value={qty} onChange={e => setQty(Math.min(max, Math.max(1, Number(e.target.value) || 1)))} /></label>
          <label className="block text-sm">السبب<select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={reason} onChange={e => setReason(e.target.value as typeof reason)}>
            {reasons.map(r => <option key={r[0]} value={r[0]}>
              {r[1]}
            </option>)}
          </select></label>
          <label className="block text-sm">مبلغ الاسترداد<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" type="number" min={0} step="0.01" value={refund} onChange={e => setRefund(e.target.value)} /></label>
          <p className="text-xs text-muted-foreground">الحد المقترح لهذه الكمية: {formatMoney(auto)} وفق قيمة البند بعد الخصم.</p>
          <label className="block text-sm">ملاحظة<textarea className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2" value={note} onChange={e => setNote(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} /> إعادة الكمية إلى المخزون</label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button disabled={max < 1 || !Number.isFinite(Number(refund)) || Number(refund) < 0 || Number(refund) > auto} loading={mutation.isPending} loadingText="جارٍ الحفظ…" onClick={() => void submit()}>تسجيل المرتجع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
