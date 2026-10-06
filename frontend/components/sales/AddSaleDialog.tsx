'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useMyAds } from '@/hooks/queries/useAds';
import { useMyServiceListings } from '@/hooks/queries/useServiceListings';
import { useCreateSale } from '@/hooks/mutations/useSaleMutations';
import { useCustomerSearch } from '@/hooks/queries/useCustomers';
import type { SaleEntityType, SaleTransferMethod, CreateSalePayload } from '@/types/sale.types';
import type { Product } from '@/types/product.types';
import type { AdListItem } from '@/types/ad.types';
import type { ServiceListing } from '@/types/service.types';

export interface SalePrefill {
  entityType?: SaleEntityType;
  entityId?: string;
  entityTitle?: string;
  entityImageUrl?: string | null;
  unitPrice?: number;
  costPrice?: number | null;
  storeId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: SalePrefill | null;
}

function FieldLabel({ children }: { children: ReactNode }) { return <span className="text-sm font-medium">{children}</span>; }

const money = (value: string | number | null | undefined) => Number(value ?? 0);

export function AddSaleDialog({ open, onOpenChange, prefill }: Props) {
  const [entityType, setEntityType] = useState<SaleEntityType>(prefill?.entityType ?? 'PRODUCT');
  const [entityId, setEntityId] = useState(prefill?.entityId ?? '');
  const [entityTitle, setEntityTitle] = useState(prefill?.entityTitle ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(prefill?.entityImageUrl ?? null);
  const [storeId, setStoreId] = useState(prefill?.storeId ?? '');
  const [quantity, setQuantity] = useState(String(prefill?.unitPrice !== undefined ? 1 : 1));
  const [unitPrice, setUnitPrice] = useState(String(prefill?.unitPrice ?? ''));
  const [costPrice, setCostPrice] = useState(prefill?.costPrice == null ? '' : String(prefill.costPrice));
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'due'>('full');
  const [paidAmount, setPaidAmount] = useState('');
  const [method, setMethod] = useState<SaleTransferMethod>('CASH');
  const [note, setNote] = useState('');

  const customerSearch = useCustomerSearch(buyerName || buyerPhone, open);

  const products = useMyProducts({ page: 1, limit: 100, status: 'ACTIVE' }, { enabled: open && entityType === 'PRODUCT' });
  const ads = useMyAds({ page: 1, limit: 100 }, { enabled: open && entityType === 'AD' });
  const services = useMyServiceListings({ page: 1, limit: 100, status: 'ACTIVE' }, { enabled: open && entityType === 'SERVICE' });
  useEffect(() => {
    if (!open) return;
    setEntityType(prefill?.entityType ?? 'PRODUCT');
    setEntityId(prefill?.entityId ?? '');
    setEntityTitle(prefill?.entityTitle ?? '');
    setImageUrl(prefill?.entityImageUrl ?? null);
    setStoreId(prefill?.storeId ?? '');
    setQuantity('1');
    setUnitPrice(prefill?.unitPrice == null ? '' : String(prefill.unitPrice));
    setCostPrice(prefill?.costPrice == null ? '' : String(prefill.costPrice));
    setBuyerName(''); setBuyerPhone(''); setCustomerId(''); setPaymentMode('full'); setPaidAmount(''); setMethod('CASH'); setNote('');
  }, [open, prefill]);

  const createSale = useCreateSale();

  const total = useMemo(() => Math.round(money(quantity) * money(unitPrice) * 100) / 100, [quantity, unitPrice]);
  const resolvedPaid = paymentMode === 'full' ? total : paymentMode === 'due' ? 0 : Math.min(total, money(paidAmount));
  const due = Math.max(0, Math.round((total - resolvedPaid) * 100) / 100);

  function selectEntity(value: string) {
    setEntityId(value);
    if (entityType === 'PRODUCT') {
      const item = (products.data?.items ?? []).find((x: Product) => x.id === value);
      if (item) {
        setEntityTitle(item.name); setUnitPrice(item.price); setImageUrl(item.images?.[0] ?? null); setStoreId(item.storeId); setCostPrice('');
      }
    } else if (entityType === 'AD') {
      const item = (ads.data?.items ?? []).find((x: AdListItem) => x.id === value);
      if (item) { setEntityTitle(item.title); setUnitPrice(String(item.price)); setImageUrl(item.images?.[0] ?? null); setStoreId(''); setCostPrice(''); }
    } else if (entityType === 'SERVICE') {
      const item = (services.data?.items ?? []).find((x: ServiceListing) => x.id === value);
      if (item) { setEntityTitle(item.title); setUnitPrice(item.price ?? '0'); setImageUrl(item.images?.[0] ?? null); setStoreId(''); setCostPrice(''); }
    }
  }

  function changeType(value: string) {
    const next = value as SaleEntityType;
    setEntityType(next); setEntityId(''); setEntityTitle(''); setImageUrl(null); setStoreId(''); setUnitPrice(''); setCostPrice('');
  }

  function resetAndClose() {
    if (createSale.isPending) return;
    onOpenChange(false);
  }

  async function submit() {
    const payload: CreateSalePayload = {
      ...(storeId ? { storeId } : {}),
      entityType,
      ...(entityId ? { entityId } : {}),
      entityTitle: entityTitle.trim(),
      entityImageUrl: imageUrl,
      quantity: Math.max(1, Math.floor(money(quantity))),
      unitPrice: money(unitPrice),
      costPrice: costPrice === '' ? null : money(costPrice),
      buyerName: buyerName.trim() || 'عميل نقدي',
      buyerPhone: buyerPhone.trim() || null,
      ...(customerId ? { customerId } : {}),
      paymentStatus: due === 0 ? 'PAID' : resolvedPaid > 0 ? 'PARTIAL' : 'UNPAID',
      paidAmount: resolvedPaid,
      payment: resolvedPaid > 0 ? { amount: resolvedPaid, method } : undefined,
      dueDate: due > 0 ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
      note: note.trim() || null,
    };
    await createSale.mutateAsync(payload);
    onOpenChange(false);
  }

  const picker = entityType === 'PRODUCT' ? products.data?.items ?? [] : entityType === 'AD' ? ads.data?.items ?? [] : services.data?.items ?? [];
  const pickerLabel = entityType === 'PRODUCT' ? 'المنتج' : entityType === 'AD' ? 'الإعلان' : 'الخدمة';

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl" dir="rtl">
        <DialogHeader><DialogTitle>تسجيل بيع جديد</DialogTitle><DialogDescription>سجّل البيع مرة واحدة، وسيُحدّث المخزون للمنتجات تلقائيًا.</DialogDescription></DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-2">
            {([['PRODUCT', 'منتج'], ['AD', 'إعلان'], ['SERVICE', 'خدمة'], ['FREE', 'مخصص']] as const).map(([value, label]) => (
              <Button key={value} type="button" variant={entityType === value ? 'default' : 'outline'} onClick={() => changeType(value)}>{label}</Button>
            ))}
          </div>

          {entityType === 'FREE' ? (
            <div className="space-y-2"><FieldLabel>اسم البيع</FieldLabel><Input value={entityTitle} onChange={(e) => setEntityTitle(e.target.value)} placeholder="مثال: خدمة صيانة" /></div>
          ) : (
            <div className="space-y-2"><FieldLabel>{pickerLabel}</FieldLabel><select value={entityId} onChange={(e) => selectEntity(e.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="">اختر {pickerLabel}</option>{picker.map((item) => <option key={item.id} value={item.id}>{'name' in item ? item.name : item.title}</option>)}</select></div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><FieldLabel>الكمية</FieldLabel><Input inputMode="numeric" min="1" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div className="space-y-2"><FieldLabel>سعر الوحدة</FieldLabel><Input inputMode="decimal" min="0" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></div>
            <div className="space-y-2"><FieldLabel>سعر التكلفة <span className="text-muted-foreground">(اختياري)</span></FieldLabel><Input inputMode="decimal" min="0" type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} /></div>
            <div className="rounded-lg border bg-muted/40 p-3"><div className="text-xs text-muted-foreground">الإجمالي</div><div className="text-lg font-bold">{total.toFixed(2)} ₪</div></div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="font-semibold">المشتري والدفع</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="relative space-y-2"><FieldLabel>اسم العميل</FieldLabel><Input value={buyerName} onChange={(e) => { setBuyerName(e.target.value); setCustomerId(''); }} placeholder="اختياري — اكتب اسمًا للبحث" />
                {customerSearch.data?.length ? <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">{customerSearch.data.map((customer) => <button type="button" key={customer.id} className="block w-full rounded-md px-3 py-2 text-start text-sm hover:bg-muted" onClick={() => { setCustomerId(customer.id); setBuyerName(customer.name); setBuyerPhone(customer.phone ?? ''); }}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}<span className="block text-xs text-muted-foreground">مشتريات {Number(customer.totalSpent).toFixed(2)} ₪ · دين {Number(customer.totalDue).toFixed(2)} ₪</span></button>)}</div> : null}
              </div>
              <div className="space-y-2"><FieldLabel>رقم الجوال</FieldLabel><Input dir="ltr" value={buyerPhone} onChange={(e) => { setBuyerPhone(e.target.value); setCustomerId(''); }} placeholder="059..." /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">{(['full','partial','due'] as const).map((mode) => <Button key={mode} type="button" variant={paymentMode === mode ? 'default' : 'outline'} onClick={() => setPaymentMode(mode)}>{mode === 'full' ? 'مدفوع كامل' : mode === 'partial' ? 'جزئي' : 'آجل'}</Button>)}</div>
            {paymentMode !== 'due' && <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><FieldLabel>{paymentMode === 'full' ? 'المدفوع' : 'المبلغ المدفوع'}</FieldLabel><Input disabled={paymentMode === 'full'} inputMode="decimal" type="number" min="0" value={paymentMode === 'full' ? total : paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></div><div className="space-y-2"><FieldLabel>طريقة الدفع</FieldLabel><select value={method} onChange={(e) => setMethod(e.target.value as SaleTransferMethod)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="CASH">نقدي</option><option value="JAWWAL_PAY">جوال باي</option><option value="BANK_PALESTINE">بنك فلسطين</option><option value="PALPAY">PalPay</option><option value="CARD">بطاقة</option><option value="OTHER">أخرى</option></select></div></div>}
            <div className="flex items-center justify-between border-t pt-3 text-sm"><span>المتبقي</span><strong>{due.toFixed(2)} ₪</strong></div>
          </div>

          <div className="space-y-2"><FieldLabel>ملاحظة</FieldLabel><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" /></div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={resetAndClose}>إلغاء</Button><Button type="button" disabled={createSale.isPending || !entityTitle.trim() || total <= 0} onClick={() => void submit()}>{createSale.isPending ? 'جارٍ التسجيل…' : 'تسجيل البيع'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
