import type { StoreStatus } from '@/types/store.types';

/**
 * MyStoreCard and AdminStoresTable each defined their own
 * local status→color map for the same StoreStatus field. They happened
 * to agree in value, but with no shared constant or test tying them
 * together, they were free to drift apart silently. Single source of
 * truth from here on, same pattern as adStatus.ts /
 * serviceRequestStatus.ts.
 */
export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  PENDING: 'قيد المراجعة',
  ACTIVE:  'نشط',
  BLOCKED: 'محظور',
};

export const STORE_STATUS_VARIANT: Record<
  StoreStatus,
  'success' | 'warning' | 'destructive'
> = {
  PENDING: 'warning',
  ACTIVE:  'success',
  BLOCKED: 'destructive',
};
