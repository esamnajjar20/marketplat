/** تنسيقات العرض المشتركة للرئيسية وأقسام الاكتشاف */
import type { AdListItem } from '@/features/ads/ads.api';
import type { ServiceListing } from '@/features/services/services.api';

export function formatPrice(price: AdListItem['price']): string {
  if (price === null || price === undefined || price === '') return 'السعر عند التواصل';
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return String(price);
  return `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(numericPrice)} ₪`;
}

export function formatServicePrice(item: ServiceListing): string {
  if (item.pricingType === 'NEGOTIABLE' || item.price == null) return 'السعر عند الاتفاق';
  const price = Number(item.price);
  if (!Number.isFinite(price)) return 'السعر عند الاتفاق';
  return `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(price)} ₪${
    item.pricingType === 'STARTING_FROM' ? ' وما فوق' : ''
  }`;
}
