'use client';
import { useState } from 'react';
import { useSalesCostSettings } from '@/hooks/queries/useSales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AddPaymentDialog } from './payments/AddPaymentDialog';
import { ReturnSaleDialog } from './ReturnSaleDialog';
import { PaymentStatusBadge } from './payments/PaymentStatusBadge';
import type { SaleRecord } from '@/types/sale.types';

const typeLabel: Record<SaleRecord['entityType'], string> = { PRODUCT: 'منتج', AD: 'إعلان', SERVICE: 'خدمة', FREE: 'مخصص' };

export function SaleCard({ sale }: { sale: SaleRecord }) {
  const { data: costSettings } = useSalesCostSettings();
  const [pay, setPay] = useState(false);
  const [ret, setRet] = useState(false);
  const net = Number(sale.totalPrice) - Number(sale.refundedAmount ?? 0);
  const profit = net - (Number(sale.costPrice ?? 0) * sale.quantity);
  return <>
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{sale.entityTitle}</h3><Badge variant="outline">{typeLabel[sale.entityType]}</Badge><PaymentStatusBadge status={sale.paymentStatus}/>{Number(sale.refundedAmount ?? 0) > 0 ? <Badge>مرتجع {Number(sale.refundedAmount).toFixed(2)} ₪</Badge> : null}</div><p className="mt-1 text-sm text-muted-foreground">{sale.buyerName}{sale.buyerPhone ? ` · ${sale.buyerPhone}` : ''}{sale.items && sale.items.length > 1 ? ` · ${sale.items.length} أصناف` : ''}</p></div></div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><div className="text-muted-foreground">الإجمالي</div><strong>{net.toFixed(2)} ₪</strong></div>
        <div><div className="text-muted-foreground">المدفوع</div><strong>{Number(sale.paidAmount).toFixed(2)} ₪</strong></div>
        <div><div className="text-muted-foreground">المتبقي</div><strong>{Number(sale.dueAmount).toFixed(2)} ₪</strong></div>
        <div><div className="text-muted-foreground">الفاتورة</div><strong>{sale.invoiceNumber ?? '—'}</strong></div>
        {costSettings?.enabled !== false && sale.costPrice != null ? <div><div className="text-muted-foreground">الربح</div><strong>{profit.toFixed(2)} ₪</strong></div> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => window.location.assign(`/account/sales/${sale.id}/receipt`)}>الإيصال</Button>{Number(sale.dueAmount) > 0 ? <Button size="sm" onClick={() => setPay(true)}>إضافة دفعة</Button> : null}{sale.entityType !== 'FREE' && sale.quantity > 0 && Number(sale.returns?.reduce((sum, r) => sum + (r as { quantity?: number }).quantity!, 0) ?? 0) < sale.quantity ? <Button size="sm" variant="outline" onClick={() => setRet(true)}>تسجيل مرتجع</Button> : null}</div>
      <div className="mt-3 text-xs text-muted-foreground">{new Date(sale.soldAt).toLocaleString('ar-PS')}</div>
    </article>
    <AddPaymentDialog sale={sale} open={pay} onOpenChange={setPay}/><ReturnSaleDialog sale={sale} open={ret} onOpenChange={setRet}/>
  </>;
}
