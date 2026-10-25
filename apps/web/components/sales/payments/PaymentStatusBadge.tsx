import type { SalePaymentStatus } from '@/types/sale.types';
import { StatusBadge } from '@/components/shared/ui/StatusBadge';

const labels: Record<SalePaymentStatus, string> = {
  PAID: 'مدفوع',
  PARTIAL: 'جزئي',
  UNPAID: 'غير مدفوع',
  OVERDUE: 'متأخر',
};

const tones: Record<SalePaymentStatus, 'success' | 'warning' | 'outline' | 'destructive'> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'outline',
  OVERDUE: 'destructive',
};

export function PaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return <StatusBadge status={status} labels={labels} tone={tones[status]} />;
}
