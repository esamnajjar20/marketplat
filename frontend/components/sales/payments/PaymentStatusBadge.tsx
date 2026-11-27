import type { SalePaymentStatus } from '@/types/sale.types';
import { StatusBadge } from '@/components/shared/ui/StatusBadge';
import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';

const labels: Record<SalePaymentStatus, string> = DOMAIN_STATUS_LABELS.salePayment;

const tones: Record<SalePaymentStatus, 'success' | 'warning' | 'outline' | 'destructive'> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'outline',
  OVERDUE: 'destructive',
};

export function PaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return <StatusBadge status={status} labels={labels} tone={tones[status]} />;
}
