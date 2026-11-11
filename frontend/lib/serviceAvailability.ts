/**
 * Single source of truth for service-provider availability presentation.
 *
 * Previously each of ServiceListingCard, ServiceProviderCard, MyServiceProviderCard,
 * MyServicesHub and ProfileServiceProviderSummary kept its own copy of the labels
 * and used a different colour scheme for the same status (hard-coded
 * `bg-emerald-500` / `bg-amber-500`, `--legacy-*` vars, or semantic tokens).
 * Everything now goes through the semantic tokens (success / warning / muted).
 */
import type { ServiceAvailability } from '@/types/service.types';

export const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

/** Small status dot. */
export const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  UNAVAILABLE: 'bg-muted-foreground',
};

/** Inline coloured text (no background). */
export const AVAILABILITY_TEXT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'text-success',
  BUSY: 'text-warning-strong dark:text-warning',
  UNAVAILABLE: 'text-muted-foreground',
};

/** Soft pill (background + text) — same convention as `TAG_AVAILABLE`. */
export const AVAILABILITY_PILL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success-soft text-success',
  BUSY: 'bg-warning-soft text-warning-strong dark:text-warning',
  UNAVAILABLE: 'bg-muted text-muted-foreground',
};
