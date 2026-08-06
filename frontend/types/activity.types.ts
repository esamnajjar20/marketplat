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
export type UserActivityType =
  | 'AD_CREATED'
  | 'AD_UPDATED'
  | 'AD_DELETED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'SERVICE_CREATED'
  | 'SERVICE_UPDATED'
  | 'SERVICE_DELETED'
  | 'STORE_CREATED'
  | 'STORE_UPDATED'
  | 'FAVORITE_ADDED'
  | 'FAVORITE_REMOVED'
  | 'STORE_FOLLOWED'
  | 'STORE_UNFOLLOWED'
  | 'MESSAGE_SENT'
  | 'SERVICE_REQUEST_CREATED'
  | 'SERVICE_REQUEST_STATUS_CHANGED'
  | 'APPOINTMENT_BOOKED'
  | 'APPOINTMENT_CANCELLED'
  | 'PROFILE_UPDATED'
  | 'PASSWORD_CHANGED';

/** Matches activity.validation.ts's ACTIVITY_GROUPS exactly — the 8
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
export type ActivityEntityType =
  | 'AD'
  | 'PRODUCT'
  | 'SERVICE_LISTING'
  | 'STORE'
  | 'CONVERSATION'
  | 'SERVICE_REQUEST'
  | 'APPOINTMENT';

/** Only SERVICE_REQUEST_STATUS_CHANGED populates this today — see
 * activity.templates.ts's serviceRequestStatusChanged builder. */
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
