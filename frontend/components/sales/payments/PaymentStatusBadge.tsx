'use client';

import { StatusBadge, type StatusTone } from '@/components/shared/ui/StatusBadge';
import type { SalePaymentStatus } from '@/types/sale.types';

const labels: Record<SalePaymentStatus, string> = {
  PAID: 'مدفوع',
  PARTIAL: 'جزئي',
  UNPAID: 'غير مدفوع',
  OVERDUE: 'متأخر',
};

const tones: Record<SalePaymentStatus, StatusTone> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'neutral',
  OVERDUE: 'danger',
};

export function PaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return <StatusBadge tone={tones[status]}>{labels[status]}</StatusBadge>;
}
