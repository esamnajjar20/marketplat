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

/**
 * تنسيق ميزانية الطلب بالعربية مع رمز العملة.
 * أمثلة: "100 – 200 ₪" | "من 50 ₪" | "حتى 300 ₪" | null
 */
export function formatRequestBudget(
  min?: string | number | null,
  max?: string | number | null,
): string | null {
  const hasMin = min != null && min !== '';
  const hasMax = max != null && max !== '';
  if (!hasMin && !hasMax) return null;

  const fmt = (v: string | number) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      return `${n.toLocaleString('ar')} ₪`;
    }
    return `${v} ₪`;
  };

  if (hasMin && hasMax) {
    if (String(min) === String(max)) return fmt(min!);
    return `${fmt(min!)} – ${fmt(max!)}`;
  }
  if (hasMin) return `من ${fmt(min!)}`;
  return `حتى ${fmt(max!)}`;
}

/** هل الطلب ينتهي خلال 48 ساعة؟ */
export function isRequestExpiringSoon(expiresAt?: string | null, withinMs = 48 * 60 * 60 * 1000): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  const remaining = t - Date.now();
  return remaining > 0 && remaining <= withinMs;
}

/** نص عربي لعدد العروض */
export function formatOffersCount(count: number): string {
  if (count === 0) return 'لا عروض بعد';
  if (count === 1) return 'عرض واحد';
  if (count === 2) return 'عرضان';
  if (count >= 3 && count <= 10) return `${count} عروض`;
  return `${count} عرضًا`;
}
