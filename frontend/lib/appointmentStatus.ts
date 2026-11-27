import type { AppointmentStatus } from '@/types/service.types';
import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';

/** Shared between AppointmentsList and any future appointment detail view. */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = DOMAIN_STATUS_LABELS.appointment;

export const APPOINTMENT_STATUS_VARIANT: Record<
  AppointmentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  SCHEDULED: 'secondary',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
  NO_SHOW: 'destructive',
};
