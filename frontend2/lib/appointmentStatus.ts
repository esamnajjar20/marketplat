import type { AppointmentStatus } from '@/types/service.types';

/** Shared between AppointmentsList and any future appointment detail view. */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'محجوز',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
  NO_SHOW: 'لم يحضر',
};

export const APPOINTMENT_STATUS_VARIANT: Record<
  AppointmentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  SCHEDULED: 'secondary',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
  NO_SHOW: 'destructive',
};
