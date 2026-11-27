import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';
import type { StoreStatus } from '@/types/store.types';
import type { StoreMemberStatus } from '@/types/store-member.types';

/**
 * MyStoreCard and AdminStoresTable each defined their own
 * local status→color map for the same StoreStatus field. They happened
 * to agree in value, but with no shared constant or test tying them
 * together, they were free to drift apart silently. Single source of
 * truth from here on, same pattern as adStatus.ts /
 * serviceRequestStatus.ts.
 */
export const STORE_STATUS_LABELS: Record<StoreStatus, string> = DOMAIN_STATUS_LABELS.store;

export const STORE_STATUS_VARIANT: Record<
  StoreStatus,
  'success' | 'warning' | 'destructive'
> = {
  PENDING: 'warning',
  ACTIVE:  'success',
  BLOCKED: 'destructive',
};

/** StoreMember.status — previously hand-rolled inside MyStoreMembersList. */
export const STORE_MEMBER_STATUS_LABELS: Record<StoreMemberStatus, string> = DOMAIN_STATUS_LABELS.storeMember;

export const STORE_MEMBER_STATUS_VARIANT: Record<
  StoreMemberStatus,
  'default' | 'secondary' | 'destructive' | 'success' | 'warning'
> = {
  PENDING: 'warning',
  ACTIVE:  'success',
  REMOVED: 'secondary',
};
