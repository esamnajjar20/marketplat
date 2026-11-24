export type ServiceAvailabilityStatus = 'AVAILABLE' | 'BUSY' | 'UNAVAILABLE' | string | null | undefined;

export function serviceAvailabilityLabel(status: ServiceAvailabilityStatus): string {
  if (status === 'AVAILABLE') return 'متاح الآن';
  if (status === 'BUSY') return 'مشغول حاليًا';
  if (status === 'UNAVAILABLE') return 'غير متاح حاليًا';
  return 'حالة التوفر غير محددة';
}

export function canRequestService(status: ServiceAvailabilityStatus): boolean {
  // Unknown status is not treated as unavailable; the API remains the authority.
  return status !== 'UNAVAILABLE';
}
