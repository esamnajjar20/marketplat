'use client';
import { Badge } from '@/components/ui/badge';
import type { SalePaymentStatus } from '@/types/sale.types';
const labels: Record<SalePaymentStatus,string> = { PAID:'مدفوع', PARTIAL:'جزئي', UNPAID:'غير مدفوع', OVERDUE:'متأخر' };
export function PaymentStatusBadge({ status }: { status: SalePaymentStatus }) { return <Badge variant={status==='PAID'?'secondary':'outline'}>{labels[status]}</Badge>; }
