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

/** StoreMember.status — previously hand-rolled inside MyStoreMembersList. */
export const STORE_MEMBER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار القبول',
  ACTIVE:  'نشط',
  REMOVED: 'مزال',
};

export const STORE_MEMBER_STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'success' | 'warning'
> = {
  PENDING: 'warning',
  ACTIVE:  'success',
  REMOVED: 'secondary',
};
