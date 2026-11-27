import { DOMAIN_STATUS_LABELS, GENERIC_STATUS_LABELS, domainStatusLabel, type StatusLabelDomain } from '@marketplat/contracts';

const STATUS_LABELS: Readonly<Record<string, string>> = GENERIC_STATUS_LABELS;
export function statusLabel(value?: string | null): string {
  if (!value) return 'غير محدد';
  const key = value.toUpperCase();
  const domainMaps = Object.values(DOMAIN_STATUS_LABELS) as Array<Record<string, string>>;
  const domainFallback = domainMaps
    .map((labels) => labels[key])
    .find((label) => typeof label === 'string');
  return STATUS_LABELS[key] ?? domainFallback ?? value.replace(/_/g, ' ');
}
export function roleLabel(value?: string | null): string {
  if (!value) return 'عضو';
  return domainStatusLabel('role', value.toUpperCase(), value);
}

/**
 * Domain-aware label registry — single source of truth for every status / type
 * label shown in the app. A bare `statusLabel()` cannot know that "ACCEPTED"
 * means "offer accepted" on a request but "accepted" on a service request, so
 * each domain owns its wording here instead of re-declaring maps inside screens.
 */
export type LabelDomain = StatusLabelDomain;

const DOMAIN_LABELS: Record<LabelDomain, Record<string, string>> = DOMAIN_STATUS_LABELS;

/**
 * Label for `value` inside `domain`. Unknown / empty values return `fallback`
 * (callers that previously echoed the raw value pass it as the fallback).
 */
export function domainLabel(domain: LabelDomain, value: string | null | undefined, fallback = 'غير محدد'): string {
  if (!value) return fallback;
  return DOMAIN_LABELS[domain][value] ?? domainStatusLabel(domain, value, fallback);
}
