'use client';
import { Badge } from '@/components/ui/badge';
import type { SaleRecord } from '@/types/sale.types';

const status: Record<SaleRecord['paymentStatus'], { label: string; className: string }> = {
  PAID: { label: 'مدفوع', className: 'bg-emerald-100 text-emerald-800' },
  PARTIAL: { label: 'جزئي', className: 'bg-amber-100 text-amber-800' },
  UNPAID: { label: 'غير مدفوع', className: 'bg-red-100 text-red-800' },
  OVERDUE: { label: 'متأخر', className: 'bg-red-200 text-red-900' },
};
const typeLabel: Record<SaleRecord['entityType'], string> = { PRODUCT: 'منتج', AD: 'إعلان', SERVICE: 'خدمة', FREE: 'بيع مخصص' };

export function SaleCard({ sale }: { sale: SaleRecord }) {
  const net = Number(sale.totalPrice) - Number(sale.refundedAmount ?? 0);
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{sale.entityTitle}</h3><Badge variant="outline">{typeLabel[sale.entityType]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{sale.buyerName}{sale.buyerPhone ? ` · ${sale.buyerPhone}` : ''}</p></div>
        <Badge className={status[sale.paymentStatus].className}>{status[sale.paymentStatus].label}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><div className="text-muted-foreground">الإجمالي</div><strong>{net.toFixed(2)} ₪</strong></div><div><div className="text-muted-foreground">المدفوع</div><strong>{Number(sale.paidAmount).toFixed(2)} ₪</strong></div><div><div className="text-muted-foreground">المتبقي</div><strong>{Number(sale.dueAmount).toFixed(2)} ₪</strong></div><div><div className="text-muted-foreground">الفاتورة</div><strong>{sale.invoiceNumber ?? '—'}</strong></div></div>
      <div className="mt-3 text-xs text-muted-foreground">{new Date(sale.soldAt).toLocaleString('ar-PS')}</div>
    </article>
  );
}
