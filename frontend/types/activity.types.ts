/**
 * Activity types — "نشاطي", the user's own cross-module activity
 * timeline. Mirrors backend prisma/schema.prisma's UserActivityType
 * enum and activity.validation.ts's ACTIVITY_GROUPS exactly.
 *
 * The 22 concrete types are always what a row's `type` field actually
 * is; ActivityGroup is the coarser 8-tab grouping the filter UI sends
 * as the `group` query param (see activity.service.ts's GROUP_TYPES
 * for which types fall under which group — that mapping is
 * server-side only, the frontend never needs to know it beyond which
 * group value to send).
 */
import type { UserActivityType, ActivityEntityType } from '@marketplat/contracts';
export type { UserActivityType, ActivityEntityType } from '@marketplat/contracts';

/** UI query grouping, intentionally not a Prisma enum. Matches activity.validation.ts's ACTIVITY_GROUPS — the 8
 * filter tabs (الكل/الإعلانات/المنتجات/الخدمات/المتاجر/الرسائل/الطلبات/الحساب). */
export type ActivityGroup =
  | 'ALL'
  | 'ADS'
  | 'PRODUCTS'
  | 'SERVICES'
  | 'STORES'
  | 'MESSAGES'
  | 'REQUESTS'
  | 'ACCOUNT';

/** entityType is a plain string tag, not a Prisma relation — same
 * non-FK reasoning as the backend model (see schema.prisma's comment
 * on UserActivity.entityType): the referenced row can be deleted
 * later without the timeline row breaking. */
/** Only SERVICE_REQUEST_STATUS_CHANGED populates this today — see
 * activity.'s serviceRequestStatusChanged builder. */
export interface ActivityMetadata {
  fromStatus?: string;
  toStatus?: string;
}

export interface UserActivity {
  id: string;
  userId: string;
  type: UserActivityType;
  title: string;
  description: string | null;
  entityType: ActivityEntityType | null;
  entityId: string | null;
  metadata: ActivityMetadata | null;
  createdAt: string;
}

export interface ActivityQuery {
  page?: number;
  limit?: number;
  type?: UserActivityType;
  group?: ActivityGroup;
  q?: string;
}
