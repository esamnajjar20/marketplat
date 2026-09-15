import type { StorePaymentMethodDto } from '@/types/store.types';
/**
 * User types.
 * Mirrors backend Prisma User model and SafeUser select.
 */

// FIX BUG-XX: this used to redeclare UserRole as 'USER' | 'ADMIN',
// stale relative to auth.types.ts's correct 4-value union ('USER' |
// 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN', kept in sync with the
// backend Prisma Role enum since Gap #20). No current code imported
// UserRole from here, but `User.role: UserRole` below inherited the
// narrow type, and any exhaustive switch added later on a `User`
// object's `.role` would silently miss MODERATOR/SUPER_ADMIN. Re-
// exporting from auth.types.ts makes it a single source of truth
// instead of two definitions that can drift again.
import type { UserRole } from './auth.types';
import type { ServiceBusinessType, ServiceAvailability } from './service.types';
import type { StorePlan } from './store.types';

/** Full user — returned by GET /users/me */
/** FIX FEAT-02: matches NotificationSettingsForm.tsx's SETTINGS keys
 * and the backend's updateNotificationPreferencesSchema exactly. */
export interface NotificationPreferences {
  newMessage:   boolean;
  adViews:      boolean;
  favAdUpdated: boolean;
  promotions:   boolean;
  /** PROMO-1: store owner's own Promotion lifecycle alerts. */
  myPromotions: boolean;
  /** Matches for saved searches (ads/products/services). */
  savedSearch: boolean;
  /** Followed-store product / promotion / restock alerts. */
  storeUpdates: boolean;
  /** Service broadcast quote submitted / accepted. */
  serviceQuotes: boolean;
}

export interface User {
  id:        string;
  name:      string;
  email:     string;
  phone:     string | null;
  city:      string | null;
  bio:       string | null;
  avatarUrl: string | null;
  role:      UserRole;
  isActive:  boolean;
  notificationPreferences: NotificationPreferences;
  // FEAT-GOOGLE-COMPLETE-PROFILE: mirrors the backend column of the
  // same name — see types/auth.types.ts's AuthUser.needsProfileCompletion
  // comment.
  needsProfileCompletion: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * UNIFIED-PROFILE: the seller/store/service-provider "roles" attached to
 * a public profile, mirroring backend users.repository.ts's
 * publicUserSelect exactly (field-for-field — nothing here that
 * endpoint doesn't already return). All three are optional/nullable on
 * the person: a plain user has sellerProfile: null; a seller with
 * neither a store nor a service business has both children null.
 */
export interface PublicProfileStore {
  id:            string;
  name:          string;
  description:   string;
  logoUrl:       string | null;
  coverImageUrl: string | null;
  city:          string;
  plan:          StorePlan;
  phone?:        string;
  // UNIFY-PAYMENTS-STORES: no paymentMethods here anymore — use the
  // parent PublicSellerProfile.paymentMethods instead (single source
  // of truth, same as PublicProfileServiceProvider).
  _count: { followers: number; products: number };
}

export interface PublicProfileServiceProvider {
  id:                     string;
  businessName:           string;
  businessType:           ServiceBusinessType;
  logoUrl:                string | null;
  description:            string;
  serviceAreaCities:      string[];
  availabilityStatus:     ServiceAvailability;
  completedRequestsCount: number;
  /** Public contact — call / WhatsApp on the profile services tab. */
  contactPhone:           string;
  // UNIFY-PAYMENTS: no paymentMethods here anymore — use the parent
  // PublicSellerProfile.paymentMethods instead (single source of truth).
}

export interface PublicSellerProfile {
  id:              string;
  displayName:     string;
  bio:             string | null;
  avatarUrl:       string | null;
  verified:        boolean;
  trustScore:      number;
  averageRating:   string;
  totalRatings:    number;
  activeAds:       number;
  totalSales:      number;
  /** Prisma Decimal(5,2), percentage — string in JSON, or null if the
   *  seller-response-metrics job hasn't measured them yet (no
   *  conversations in its lookback window). */
  responseRate:        string | null;
  responseTimeMinutes: number | null;
  joinedSellingAt: string;
  paymentMethods?: StorePaymentMethodDto[] | null;
  _count: { serviceReviews: number };
  storeDetails:            PublicProfileStore | null;
  serviceProviderDetails:  PublicProfileServiceProvider | null;
}

/** Public profile — returned by GET /users/:id (no email/phone) */
export type PublicUser = Pick<User, 'id' | 'name' | 'city' | 'bio' | 'avatarUrl' | 'createdAt'> & {
  _count: { ads: number };
  sellerProfile: PublicSellerProfile | null;
};

/**
 * Payload for PATCH /users/me.
 *
 * L-6 (audit fix): avatarUrl removed — it mirrored the backend's
 * updateProfileSchema, which dropped the same field because it was
 * dead: ProfileSettingsForm.tsx never sent it, and avatar changes go
 * through the separate POST /users/me/avatar upload flow instead (see
 * users.api.ts's uploadAvatar / useUpdateAvatar). See
 * users.validation.ts (backend) for the full reasoning.
 */
export interface UpdateProfilePayload {
  name?:      string;
  city?:      string;
  bio?:       string;
  phone?:     string;
}
