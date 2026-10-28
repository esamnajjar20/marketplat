/**
 * استئناف مسودة أوفلاين من مركز المزامنة.
 *
 * - رابط ?draftId= على صفحات الإنشاء/التعديل
 * - sessionStorage يربط نفس الـ id بمحاولة الإرسال التالية (حتى
 *   saveAdDraft يحدّث المسودة بدل إنشاء واحدة جديدة)
 *
 * دورة حياة active id (FIX RESUME-LEAK-01):
 *   يُضبط عند نجاح تحميل ?draftId= فقط.
 *   يُمسَح عند: نجاح الإرسال (mutations onSuccess) | إلغاء النموذج |
 *   فتح نموذج بلا draftId | فشل تحميل المسودة لا يضبطه أصلًا.
 *   بدون المسح، إنشاء لاحق في نفس التبويب كان يقدر يستبدل مسودة نوع آخر.
 *
 * الصور الأصلية غير قابلة للاستعادة من المسودة (معاينات مضغوطة فقط) —
 * الحقول النصية فقط تُعاد تعبئتها؛ المستخدم يعيد اختيار الصور إن لزم.
 */

import { ROUTES } from '@/lib/constants';
import type { AdDraft, OfflineDraftKind } from '@/lib/offlineAdDrafts';
import type { AdCondition } from '@/types/ad.types';

const ACTIVE_KEY = 'market-offline-resume-draft-id';

export function setActiveOfflineDraftId(id: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (id) sessionStorage.setItem(ACTIVE_KEY, id);
  else sessionStorage.removeItem(ACTIVE_KEY);
}

export function getActiveOfflineDraftId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(ACTIVE_KEY);
}

export function clearActiveOfflineDraftId(): void {
  setActiveOfflineDraftId(null);
}

/**
 * رابط "متابعة" من مركز المزامنة حسب kind + mode + remoteAdId.
 * مسودات قديمة بلا kind تُعامل كإعلان.
 */
export function resumeHrefForDraft(d: AdDraft): string {
  const kind: OfflineDraftKind = d.kind ?? 'ad';
  const q = `draftId=${encodeURIComponent(d.id)}`;

  if (kind === 'product') {
    if (d.mode === 'edit' && d.remoteAdId) {
      return `${ROUTES.myStoreProductEdit(d.remoteAdId)}?${q}`;
    }
    return `${ROUTES.myStoreProductCreate}?${q}`;
  }

  if (kind === 'service') {
    if (d.mode === 'edit' && d.remoteAdId) {
      return `${ROUTES.myServiceEdit(d.remoteAdId)}?${q}`;
    }
    return `${ROUTES.myServiceCreate}?${q}`;
  }

  if (kind === 'open-request') {
    return `${ROUTES.requestNew}?${q}`;
  }

  // T780 — service-broadcast branch removed. The route
  // (ROUTES.serviceBroadcastNew) and the underlying feature were
  // dropped by migration 20260917121810; a leftover draft with
  // kind:'service-broadcast' falls through to the default 'ad' branch
  // below, which still resolves to a valid route. This matches the
  // removal of the ROUTES entries in lib/constants.ts.

  // ad
  if (d.mode === 'edit' && d.remoteAdId) {
    return `${ROUTES.adEdit(d.remoteAdId)}?${q}`;
  }
  return `${ROUTES.adCreate}?${q}`;
}

/** يحول حمولة المسودة إلى حقول مناسبة لنموذج الإعلان (نص + isNegotiable). */
export function adFieldsFromDraftPayload(payload: AdDraft['payload']): {
  title: string;
  description: string;
  price: string;
  condition: AdCondition | '';
  city: string;
  categoryId: string;
  isNegotiable: boolean;
} {
  return {
    title: String(payload.title ?? ''),
    description: String(payload.description ?? ''),
    price: payload.price != null && payload.price !== '' ? String(payload.price) : '',
    condition: (['NEW', 'USED', 'REFURBISHED'] as const).includes(
      payload.condition as AdCondition
    )
      ? (payload.condition as AdCondition)
      : '',
    city: String(payload.city ?? ''),
    categoryId: String(payload.categoryId ?? ''),
    // FIX AD-DRAFT-FIELDS-01: استعادة خيار «قابل للتفاوض» مع باقي الحقول.
    isNegotiable: Boolean(payload.isNegotiable),
  };
}

export function productFieldsFromDraftPayload(payload: AdDraft['payload']): {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  wholesalePrice: string;
  costPrice: string;
  wholesaleMinQty: string;
  availability: string;
  stockQuantity: string;
  attributes?: Record<string, string | number | boolean>;
} {
  const name =
    (typeof payload.name === 'string' && payload.name) ||
    String(payload.title ?? '');
  return {
    categoryId: String(payload.categoryId ?? ''),
    name,
    description: String(payload.description ?? ''),
    price: payload.price != null && payload.price !== '' ? String(payload.price) : '',
    discountPrice:
      payload.discountPrice != null && payload.discountPrice !== ''
        ? String(payload.discountPrice)
        : '',
    wholesalePrice:
      payload.wholesalePrice != null && payload.wholesalePrice !== ''
        ? String(payload.wholesalePrice)
        : '',
    costPrice:
      payload.costPrice != null && payload.costPrice !== ''
        ? String(payload.costPrice)
        : '',
    wholesaleMinQty:
      payload.wholesaleMinQty != null && payload.wholesaleMinQty !== ''
        ? String(payload.wholesaleMinQty)
        : '',
    availability: String(payload.availability ?? 'IN_STOCK'),
    stockQuantity:
      payload.stockQuantity != null && payload.stockQuantity !== ''
        ? String(payload.stockQuantity)
        : '',
    attributes: payload.attributes && typeof payload.attributes === 'object' && !Array.isArray(payload.attributes)
      ? payload.attributes as Record<string, string | number | boolean>
      : {},
  };
}

export function serviceFieldsFromDraftPayload(payload: AdDraft['payload']): {
  serviceTypeId: string;
  categoryId: string;
  title: string;
  description: string;
  pricingType: string;
  price: string;
  durationEstimate: string;
  serviceLocation: string;
  attributes?: Record<string, string | number | boolean | string[]>;
} {
  return {
    serviceTypeId: String(payload.serviceTypeId ?? ''),
    categoryId: String(payload.categoryId ?? ''),
    title: String(payload.title ?? ''),
    description: String(payload.description ?? ''),
    pricingType: String(payload.pricingType ?? 'NEGOTIABLE'),
    price: payload.price != null && payload.price !== '' ? String(payload.price) : '',
    durationEstimate: String(payload.durationEstimate ?? ''),
    serviceLocation: String(payload.serviceLocation ?? 'AT_PROVIDER'),
    attributes: payload.attributes && typeof payload.attributes === 'object' && !Array.isArray(payload.attributes)
      ? payload.attributes as Record<string, string | number | boolean | string[]>
      : {},
  };
}
