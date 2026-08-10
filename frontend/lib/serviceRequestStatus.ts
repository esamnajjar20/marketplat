import type { ServiceRequestStatus } from '@/types/service.types';

/** Shared between MyServiceRequestsList (customer) and IncomingServiceRequestsList (provider). */
export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  PENDING: 'قيد الانتظار',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
};

export const SERVICE_REQUEST_STATUS_VARIANT: Record<
  ServiceRequestStatus,
  'success' | 'warning' | 'destructive' | 'outline'
> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'destructive',
  IN_PROGRESS: 'success',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
};
