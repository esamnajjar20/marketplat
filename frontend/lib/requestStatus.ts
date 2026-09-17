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
