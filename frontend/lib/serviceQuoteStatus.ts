import type { ServiceQuoteStatus } from '@/types/service.types';

export const SERVICE_QUOTE_STATUS_LABELS: Record<ServiceQuoteStatus, string> = {
  PENDING: 'قيد الانتظار',
  ACCEPTED: 'مقبول',
  DECLINED: 'مرفوض',
  WITHDRAWN: 'مسحوب',
};

export const SERVICE_QUOTE_STATUS_VARIANT: Record<
  ServiceQuoteStatus,
  'success' | 'warning' | 'destructive' | 'outline'
> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  DECLINED: 'destructive',
  WITHDRAWN: 'outline',
};
