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
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  ACCEPTED: 'default',
  REJECTED: 'destructive',
  IN_PROGRESS: 'default',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
};
