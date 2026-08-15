import type { AdStatus } from '@/types/ad.types';

/**
 * FIX UX-13: MyAdsList, AdminAdsTable, and AdDetail each hand-rolled
 * their own status→color mapping locally, and disagreed — the same
 * ad.status rendered a different badge color on each page (e.g.
 * ACTIVE was 'default' on MyAdsList but 'success' on AdminAdsTable).
 * Single source of truth from here on, matching the pattern already
 * used for ServiceRequest/Appointment status (see
 * serviceRequestStatus.ts / appointmentStatus.ts).
 *
 * Text stays sourced from the existing STATUS_LABELS in constants.ts
 * (unchanged, already consistent) — this file only adds the color.
 */
export const AD_STATUS_VARIANT: Record<
  AdStatus,
  'success' | 'secondary' | 'destructive'
> = {
  ACTIVE:  'success',
  SOLD:    'secondary',
  DELETED: 'destructive',
};
