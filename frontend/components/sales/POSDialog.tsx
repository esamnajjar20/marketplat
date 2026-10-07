'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ShoppingCart, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useCustomerSearch } from '@/hooks/queries/useCustomers';
import { useCreateSale } from '@/hooks/mutations/useSaleMutations';
import { MixedPaymentForm, type PaymentPart } from './payments/MixedPaymentForm';
import { InstallmentForm, type InstallmentDraft } from './payments/InstallmentForm';
import type { ProductWithStore } from '@/types/product.types';
import type { SaleTransferMethod } from '@/types/sale.types';

type CartLine = { product: ProductWithStore; quantity: number; unitPrice: number; discount: number };
const n = (v: string | number | null | undefined) => Number(v ?? 0);

export function POSDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'due' | 'installments'>('full');
  const [method, setMethod] = useState<SaleTransferMethod>('CASH');
  const [payments, setPayments] = useState<PaymentPart[]>([{ amount: '', method: 'CASH' }]);
  const [installments, setInstallments] = useState<InstallmentDraft[]>([]);
  const [note, setNote] = useState('');
  const products = useMyProducts({ page: 1, limit: 100, status: 'ACTIVE' }, { enabled: open });
  const customers = useCustomerSearch(customerQuery, open);
  const create = useCreateSale();

  useEffect(() => {
    if (!open) return;
    setQuery(''); setCart([]); setCustomerQuery(''); setCustomerId(''); setBuyerName(''); setBuyerPhone('');
    setPaymentMode('full'); setMethod('CASH'); setPayments([{ amount: '', method: 'CASH' }]); setInstallments([]); setNote('');
  }, [open]);

  // useMyProducts is typed as Product[] but the /products/me endpoint
  // actually returns the richer ProductWithStore shape (with `store` and
  // `effectivePrice`). Cast locally so POS-specific fields are visible.
  const available = useMemo(
    () => ((products.data?.items ?? []) as unknown as ProductWithStore[])
      .filter((p) => p.status === 'ACTIVE' && (!query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))),
    [products.data?.items, query],
  );
  const total = useMemo(() => cart.reduce((s, x) => s + Math.max(0, x.unitPrice - x.discount) * x.quantity, 0), [cart]);
  const quantity = cart.reduce((s, x) => s + x.quantity, 0);
  const mixedTotal = payments.reduce((s, p) => s + n(p.amount), 0);
  const paid = paymentMode === 'full' ? total : paymentMode === 'partial' ? Math.min(total, mixedTotal) : 0;
  const installmentTotal = installments.reduce((s, x) => s + x.amount, 0);
  const due = paymentMode === 'installments' ? Math.max(0, total - installmentTotal) : Math.max(0, total - paid);

  const addProduct = (product: ProductWithStore) => setCart((current) => {
    const existing = current.find((x) => x.product.id === product.id);
    if (existing) return current.map((x) => x.product.id === product.id ? { ...x, quantity: x.quantity + 1 } : x);
    return [...current, { product, quantity: 1, unitPrice: n(product.effectivePrice?.price ?? product.price), discount: 0 }];
  });
  const remove = (id: string) => setCart((current) => current.filter((x) => x.product.id !== id));
  const changeQty = (id: string, quantity: number) => setCart((current) => current.map((x) => x.product.id === id ? { ...x, quantity: Math.max(1, Math.floor(quantity || 1)) } : x));
  const changePrice = (id: string, unitPrice: number) => setCart((current) => current.map((x) => x.product.id === id ? { ...x, unitPrice: Math.max(0, unitPrice) } : x));
  const changeDiscount = (id: string, discount: number) => setCart((current) => current.map((x) => x.product.id === id ? { ...x, discount: Math.max(0, Math.min(unitPriceOf(x), discount)) } : x));
  const unitPriceOf = (x: CartLine) => x.unitPrice;

  const submit = async () => {
    if (!cart.length || total <= 0 || (paymentMode === 'partial' && (mixedTotal <= 0 || mixedTotal > total)) || (paymentMode === 'installments' && (!installments.length || Math.abs(installmentTotal - total) > 0.009))) return;
    const actualPaid = paymentMode === 'full' ? total : paymentMode === 'partial' ? mixedTotal : 0;
    const first = cart[0];
    if (!first) return;
    try {
      await create.mutateAsync({
        storeId: first.product.storeId,
        entityType: 'PRODUCT',
        entityTitle: cart.length === 1 ? first.product.name : `${first.product.name} + ${cart.length - 1} منتجات`,
        entityImageUrl: first.product.images?.[0] ?? null,
        quantity,
        unitPrice: total / Math.max(1, quantity),
        buyerName: buyerName.trim() || 'عميل نقدي',
        buyerPhone: buyerPhone.trim() || null,
        ...(customerId ? { customerId } : {}),
        paidAmount: actualPaid,
        paymentStatus: actualPaid >= total ? 'PAID' : actualPaid > 0 ? 'PARTIAL' : 'UNPAID',
        dueDate: actualPaid < total ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
        note: note.trim() || null,
        items: cart.map((x) => ({ productId: x.product.id, quantity: x.quantity, unitPrice: x.unitPrice, discount: x.discount })),
        ...(actualPaid > 0 ? (paymentMode === 'partial' ? { payments: payments.filter((p) => n(p.amount) > 0).map((p) => ({ amount: n(p.amount), method: p.method, transferRef: p.transferRef })) } : { payment: { amount: actualPaid, method } }) : {}),
        ...(paymentMode === 'installments' ? { installments } : {}),
      });
      onOpenChange(false);
    } catch (error) {
      if ((error as { code?: string })?.code === 'OFFLINE_SALE_QUEUED') onOpenChange(false);
      else throw error;
    }
  };

  return <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) onOpenChange(v); }}>
    <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-5xl" dir="rtl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> نقطة البيع</DialogTitle><DialogDescription>أضف عدة منتجات إلى فاتورة واحدة، ثم اختر العميل وطريقة الدفع.</DialogDescription></DialogHeader>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-3">
          <div className="relative"><Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن منتج…" /></div>
          <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {available.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="rounded-xl border p-3 text-right transition hover:bg-muted/50">
              <div className="flex items-start justify-between gap-2"><strong className="line-clamp-2">{product.name}</strong><span className="shrink-0 text-sm">{n(product.effectivePrice?.price ?? product.price).toFixed(2)} ₪</span></div>
              <p className="mt-1 text-xs text-muted-foreground">المخزون: {product.stockQuantity ?? 'غير محدود'}</p>
            </button>)}
            {!available.length ? <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد منتجات مطابقة.</div> : null}
          </div>
          <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between"><strong>السلة ({cart.length})</strong><span className="text-sm text-muted-foreground">{quantity} قطعة</span></div>
            <div className="space-y-2">
              {cart.map((line) => <div key={line.product.id} className="grid gap-2 rounded-lg bg-muted/30 p-2 sm:grid-cols-[1fr_90px_100px_100px_90px_32px] sm:items-center">
                <div className="min-w-0"><strong className="line-clamp-1 text-sm">{line.product.name}</strong><span className="text-xs text-muted-foreground">متاح: {line.product.stockQuantity ?? 'غير محدود'}</span></div>
                <Input type="number" min="1" value={line.quantity} onChange={(e) => changeQty(line.product.id, n(e.target.value))} aria-label="الكمية" />
                <Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => changePrice(line.product.id, n(e.target.value))} aria-label="السعر" />
                <Input type="number" min="0" step="0.01" value={line.discount} onChange={(e) => changeDiscount(line.product.id, n(e.target.value))} aria-label="الخصم" />
                <strong className="text-sm">{(Math.max(0, line.unitPrice - line.discount) * line.quantity).toFixed(2)} ₪</strong>
                <Button variant="ghost" size="icon" onClick={() => remove(line.product.id)} aria-label="حذف"><Trash2 className="h-4 w-4" /></Button>
              </div>)}
              {!cart.length ? <p className="py-8 text-center text-sm text-muted-foreground">أضف المنتجات إلى السلة.</p> : null}
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <div className="rounded-xl border p-4"><strong>العميل</strong><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="relative sm:col-span-2"><Input value={buyerName} onChange={(e) => { setBuyerName(e.target.value); setCustomerId(''); setCustomerQuery(e.target.value); }} placeholder="اسم العميل" />{customers.data?.length ? <div className="absolute top-full z-30 mt-1 w-full rounded-lg border bg-popover p-1 shadow">{customers.data.map((c) => <button key={c.id} type="button" className="block w-full rounded p-2 text-right text-sm hover:bg-muted" onClick={() => { setCustomerId(c.id); setBuyerName(c.name); setBuyerPhone(c.phone ?? ''); setCustomerQuery(''); }}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</button>)}</div> : null}</div><Input dir="ltr" value={buyerPhone} onChange={(e) => { setBuyerPhone(e.target.value); setCustomerId(''); setCustomerQuery(e.target.value); }} placeholder="رقم الجوال" /></div></div>
          <div className="rounded-xl border p-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([['full','كامل'],['partial','متعدد'],['due','آجل'],['installments','تقسيط']] as const).map(([v,l]) => <Button key={v} type="button" variant={paymentMode === v ? 'default' : 'outline'} onClick={() => setPaymentMode(v)}>{l}</Button>)}</div>
            {paymentMode === 'full' ? <div className="mt-3 grid grid-cols-2 gap-2"><select value={method} onChange={(e) => setMethod(e.target.value as SaleTransferMethod)} className="h-10 rounded-md border bg-background px-3"><option value="CASH">نقدي</option><option value="JAWWAL_PAY">جوال باي</option><option value="BANK_PALESTINE">بنك فلسطين</option><option value="PALPAY">PalPay</option><option value="CARD">بطاقة</option><option value="OTHER">أخرى</option></select><div className="rounded-lg bg-muted/40 p-2 text-sm">المدفوع: <strong>{total.toFixed(2)} ₪</strong></div></div> : null}
            {paymentMode === 'partial' ? <div className="mt-3"><MixedPaymentForm payments={payments} onChange={setPayments} total={total} /></div> : null}
            {paymentMode === 'installments' ? <div className="mt-3"><InstallmentForm due={total} onChange={setInstallments} /><p className="mt-2 text-xs text-muted-foreground">مجموع الأقساط: {installmentTotal.toFixed(2)} ₪</p></div> : null}
            <div className="mt-4 flex justify-between border-t pt-3"><span>المتبقي</span><strong>{due.toFixed(2)} ₪</strong></div>
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة على الفاتورة" />
          <div className="rounded-xl border bg-muted/30 p-4"><div className="flex justify-between text-sm"><span>الإجمالي</span><strong className="text-xl">{total.toFixed(2)} ₪</strong></div><p className="mt-1 text-xs text-muted-foreground">الخصومات محسوبة على مستوى كل منتج.</p></div>
        </section>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button disabled={create.isPending || !cart.length || total <= 0 || (paymentMode === 'partial' && (mixedTotal <= 0 || mixedTotal > total)) || (paymentMode === 'installments' && (!installments.length || Math.abs(installmentTotal - total) > 0.009))} onClick={() => void submit()}>{create.isPending ? 'جارٍ التسجيل…' : 'إتمام البيع'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
