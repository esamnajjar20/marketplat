import type { ServiceRequestStatus } from '@/types/service.types';
import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';

/** Shared between MyServiceRequestsList (customer) and IncomingServiceRequestsList (provider). */
export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = DOMAIN_STATUS_LABELS.serviceRequest;

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
  EXPIRED: 'outline',
  DISPUTED: 'destructive',
};
