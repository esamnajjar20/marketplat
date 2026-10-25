'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Receipt, RotateCcw } from 'lucide-react';
import { useSalesCostSettings } from '@/hooks/queries/useSales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AddPaymentDialog } from './payments/AddPaymentDialog';
import { ReturnSaleDialog } from './ReturnSaleDialog';
import { PaymentStatusBadge } from './payments/PaymentStatusBadge';
import type { SaleRecord } from '@/types/sale.types';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const typeLabel: Record<SaleRecord['entityType'], string> = {
  PRODUCT: 'منتج',
  AD: 'إعلان',
  SERVICE: 'خدمة',
  FREE: 'مخصص',
};

export function SaleCard({ sale }: { sale: SaleRecord }) {
  const { data: costSettings } = useSalesCostSettings();
  const [pay, setPay] = useState(false);
  const [ret, setRet] = useState(false);
  const net = Number(sale.totalPrice) - Number(sale.refundedAmount ?? 0);
  const profit = net - Number(sale.costPrice ?? 0) * sale.quantity;
  const due = Number(sale.dueAmount);

  return (
    <>
      <article className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="rounded-full text-[11px] font-bold">
                {typeLabel[sale.entityType]}
              </Badge>
              <PaymentStatusBadge status={sale.paymentStatus} />
              {Number(sale.refundedAmount ?? 0) > 0 ? (
                <Badge className="rounded-full text-[11px]">مرتجع</Badge>
              ) : null}
            </div>
            <h3 className="mt-1.5 truncate text-[15px] font-extrabold leading-snug">{sale.entityTitle}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sale.buyerName || 'عميل نقدي'}
              {sale.buyerPhone ? ` · ${sale.buyerPhone}` : ''}
              {sale.items && sale.items.length > 1 ? ` · ${sale.items.length} أصناف` : ''}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(sale.soldAt)}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-[11px] text-muted-foreground">الإجمالي</p>
            <p className="font-extrabold tabular-nums">{net.toFixed(2)} ₪</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">المدفوع</p>
            <p className="font-extrabold tabular-nums">{Number(sale.paidAmount).toFixed(2)} ₪</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">المتبقي</p>
            <p className={cn('font-extrabold tabular-nums', due > 0 && 'text-destructive')}>
              {due.toFixed(2)} ₪
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">الفاتورة</p>
            <p className="font-extrabold tabular-nums">{sale.invoiceNumber ?? '—'}</p>
          </div>
          {costSettings?.enabled !== false && sale.costPrice != null ? (
            <div>
              <p className="text-[11px] text-muted-foreground">الربح</p>
              <p className="font-extrabold tabular-nums text-primary">{profit.toFixed(2)} ₪</p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild className="h-10 flex-1 rounded-xl font-bold gap-1.5">
            <Link href={`/account/sales/${sale.id}/receipt`}>
              <Receipt className="h-3.5 w-3.5" />
              الإيصال
            </Link>
          </Button>
          {sale.entityType !== 'FREE' &&
          sale.quantity > 0 &&
          Number(sale.returns?.reduce((sum, r) => sum + Number((r as { quantity?: number }).quantity ?? 0), 0) ?? 0) <
            sale.quantity ? (
            <Button
              variant="outline"
              size="sm"
              className="h-10 flex-1 rounded-xl font-bold gap-1.5"
              onClick={() => setRet(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              إرجاع
            </Button>
          ) : null}
          {due > 0 ? (
            <Button size="sm" className="h-10 w-full rounded-xl font-bold" onClick={() => setPay(true)}>
              تسجيل دفعة
            </Button>
          ) : null}
        </div>
      </article>

      <AddPaymentDialog sale={sale} open={pay} onOpenChange={setPay} />
      <ReturnSaleDialog sale={sale} open={ret} onOpenChange={setRet} />
    </>
  );
}
