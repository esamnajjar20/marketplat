import type { RequestOfferStatus, RequestStatus, RequestType } from '@/types/request.types';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  OPEN: 'مفتوح',
  ACCEPTED: 'مقبول',
  CANCELLED: 'ملغى',
  EXPIRED: 'منتهي',
};

export const REQUEST_OFFER_STATUS_LABEL: Record<RequestOfferStatus, string> = {
  PENDING: 'قيد الانتظار',
  ACCEPTED: 'مقبول',
  DECLINED: 'مرفوض',
  WITHDRAWN: 'مسحوب',
};

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  SERVICE: 'خدمة',
  PRODUCT: 'منتج',
  RENTAL: 'إيجار',
};

/** Badge variants aligned with rest of the app. */
export const REQUEST_STATUS_VARIANT: Record<
  RequestStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  OPEN: 'default',
  ACCEPTED: 'secondary',
  CANCELLED: 'destructive',
  EXPIRED: 'outline',
};

export const REQUEST_OFFER_STATUS_VARIANT: Record<
  RequestOfferStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'default',
  ACCEPTED: 'secondary',
  DECLINED: 'destructive',
  WITHDRAWN: 'outline',
};

export const REQUEST_TYPE_VARIANT: Record<
  RequestType,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  SERVICE: 'secondary',
  PRODUCT: 'outline',
  RENTAL: 'outline',
};

export function formatRequestBudget(
  min?: string | number | null,
  max?: string | number | null,
): string | null {
  if (min == null && max == null) return null;
  const a = min != null && min !== '' ? String(min) : '—';
  const b = max != null && max !== '' ? String(max) : '—';
  return `${a} – ${b}`;
}
