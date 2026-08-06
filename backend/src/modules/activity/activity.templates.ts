import { ActivityEntityType, Prisma, UserActivityType } from '@prisma/client';
import { CreateActivityInput } from './activity.repository';

/**
 * Gap #10: the ONE place that maps a domain event onto the Arabic
 * title/description/entity-link a timeline row shows — every module's
 * service (ads, products, service-listings, stores, favorites,
 * conversations, service-requests, appointments, users) calls one of
 * these builders and hands the result straight to
 * `activityService.record()`. Centralising the copy here is what keeps
 * a phrase like "تم نشر إعلان جديد" from being retyped (and
 * potentially drifting) at 20 different call sites — the same
 * "shared builder, not copy-pasted literals" shape notificationEvents
 * already uses for title/body in notifications.service.ts.
 *
 * Each builder returns everything record() needs except userId, which
 * every call site already has in scope and passes separately — kept
 * out of these builders so their signatures stay about *what
 * happened*, not *who it happened to*.
 */
export const activityTemplates = {
  adCreated: (adId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.AD_CREATED,
    title: 'تم نشر إعلان جديد',
    description: title,
    entityType: ActivityEntityType.AD,
    entityId: adId,
  }),

  adUpdated: (adId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.AD_UPDATED,
    title: 'تم تعديل إعلان',
    description: title,
    entityType: ActivityEntityType.AD,
    entityId: adId,
  }),

  adDeleted: (adId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.AD_DELETED,
    title: 'تم حذف إعلان',
    description: title,
    entityType: ActivityEntityType.AD,
    entityId: adId,
  }),

  productCreated: (productId: string, name: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.PRODUCT_CREATED,
    title: 'تم إضافة منتج جديد',
    description: name,
    entityType: ActivityEntityType.PRODUCT,
    entityId: productId,
  }),

  productUpdated: (productId: string, name: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.PRODUCT_UPDATED,
    title: 'تم تعديل منتج',
    description: name,
    entityType: ActivityEntityType.PRODUCT,
    entityId: productId,
  }),

  productDeleted: (productId: string, name: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.PRODUCT_DELETED,
    title: 'تم حذف منتج',
    description: name,
    entityType: ActivityEntityType.PRODUCT,
    entityId: productId,
  }),

  serviceCreated: (listingId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.SERVICE_CREATED,
    title: 'تم إضافة خدمة جديدة',
    description: title,
    entityType: ActivityEntityType.SERVICE_LISTING,
    entityId: listingId,
  }),

  serviceUpdated: (listingId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.SERVICE_UPDATED,
    title: 'تم تعديل خدمة',
    description: title,
    entityType: ActivityEntityType.SERVICE_LISTING,
    entityId: listingId,
  }),

  serviceDeleted: (listingId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.SERVICE_DELETED,
    title: 'تم حذف خدمة',
    description: title,
    entityType: ActivityEntityType.SERVICE_LISTING,
    entityId: listingId,
  }),

  storeCreated: (storeId: string, name: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.STORE_CREATED,
    title: 'تم إنشاء متجر',
    description: name,
    entityType: ActivityEntityType.STORE,
    entityId: storeId,
  }),

  storeUpdated: (storeId: string, name: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.STORE_UPDATED,
    title: 'تم تعديل بيانات المتجر',
    description: name,
    entityType: ActivityEntityType.STORE,
    entityId: storeId,
  }),

  favoriteAdded: (adId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.FAVORITE_ADDED,
    title: 'أضفت إعلاناً للمفضلة',
    description: title,
    entityType: ActivityEntityType.AD,
    entityId: adId,
  }),

  favoriteRemoved: (adId: string, title: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.FAVORITE_REMOVED,
    title: 'أزلت إعلاناً من المفضلة',
    description: title,
    entityType: ActivityEntityType.AD,
    entityId: adId,
  }),

  storeFollowed: (storeId: string, name: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.STORE_FOLLOWED,
    title: 'بدأت متابعة متجر',
    description: name,
    entityType: ActivityEntityType.STORE,
    entityId: storeId,
  }),

  storeUnfollowed: (storeId: string, name: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.STORE_UNFOLLOWED,
    title: 'ألغيت متابعة متجر',
    description: name,
    entityType: ActivityEntityType.STORE,
    entityId: storeId,
  }),

  // MESSAGE_SENT deliberately carries no entity title beyond "someone"
  // — unlike an ad/product, the recipient's name is contextual to the
  // sender, not a fixed label worth persisting into `description`. The
  // conversation link (entityId) is what makes this row useful; the
  // recipient's name is passed straight into description as-is by the
  // caller, so it stays accurate even if the recipient later renames
  // their profile.
  messageSent: (conversationId: string, recipientName: string): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.MESSAGE_SENT,
    title: 'أرسلت رسالة',
    description: `إلى ${recipientName}`,
    entityType: ActivityEntityType.CONVERSATION,
    entityId: conversationId,
  }),

  serviceRequestCreated: (
    requestId: string,
    listingTitle: string
  ): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.SERVICE_REQUEST_CREATED,
    title: 'طلبت خدمة',
    description: listingTitle,
    entityType: ActivityEntityType.SERVICE_REQUEST,
    entityId: requestId,
  }),

  // Carries fromStatus/toStatus in metadata (not baked into the
  // Arabic description) so the frontend can render its own badge/color
  // per status without parsing it back out of free text — same
  // "structured data in metadata, human copy in title/description"
  // split as every other builder above, just with metadata actually
  // populated here since this is the one activity type where the
  // *old* value matters, not just the new one.
  serviceRequestStatusChanged: (
    requestId: string,
    listingTitle: string,
    fromStatus: string,
    toStatus: string
  ): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.SERVICE_REQUEST_STATUS_CHANGED,
    title: 'تغيّرت حالة طلب خدمة',
    description: `${listingTitle} — ${toStatus}`,
    entityType: ActivityEntityType.SERVICE_REQUEST,
    entityId: requestId,
    metadata: { fromStatus, toStatus } as Prisma.InputJsonValue,
  }),

  appointmentBooked: (
    appointmentId: string,
    scheduledStart: Date
  ): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.APPOINTMENT_BOOKED,
    title: 'تم حجز موعد',
    description: scheduledStart.toISOString(),
    entityType: ActivityEntityType.APPOINTMENT,
    entityId: appointmentId,
  }),

  appointmentCancelled: (
    appointmentId: string,
    scheduledStart: Date
  ): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.APPOINTMENT_CANCELLED,
    title: 'تم إلغاء موعد',
    description: scheduledStart.toISOString(),
    entityType: ActivityEntityType.APPOINTMENT,
    entityId: appointmentId,
  }),

  profileUpdated: (): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.PROFILE_UPDATED,
    title: 'تم تحديث الملف الشخصي',
  }),

  passwordChanged: (): Omit<CreateActivityInput, 'userId'> => ({
    type: UserActivityType.PASSWORD_CHANGED,
    title: 'تم تغيير كلمة المرور',
  }),
};
