/**
 * Service provider / listing / request / review / appointment types.
 * Mirrors backend's actual Prisma models — verified directly against
 * backend-v17's prisma/schema.prisma and each module's *.validation.ts /
 * *.controller.ts (NOT services-design.md's assumed shapes; the real
 * backend was uploaded this round and several details differ — see the
 * inline notes below each time that happened).
 *
 * A ServiceProviderDetails row hangs off SellerProfile (see
 * seller.types.ts) — a user must already be a seller (own a
 * SellerProfile) before they can become a service provider. There is
 * no standalone "service provider role".
 */
import type { SellerProfile } from './seller.types';

export type ServiceTypeFieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT';
export type ServiceTypeFieldScope = 'LISTING' | 'PROVIDER';

export interface ServiceTypeFieldOption {
  value: string;
  labelAr: string;
}

export interface ServiceTypeField {
  id: string;
  serviceTypeId: string;
  key: string;
  scope: ServiceTypeFieldScope;
  label: string;
  labelAr: string;
  cardLabelAr: string | null;
  pageLabelAr: string | null;
  type: ServiceTypeFieldType;
  required: boolean;
  showOnCard: boolean;
  showOnPage: boolean;
  options: ServiceTypeFieldOption[] | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ServiceTypeCapabilities {
  appointments?: boolean; requestQuote?: boolean; remote?: boolean; atCustomer?: boolean; atProvider?: boolean;
  allowedPricingTypes?: ServicePricingType[]; allowedLocations?: ServiceLocationType[];
}

export interface ServiceType {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  icon: string | null;
  labels: Record<string, unknown> | null;
  capabilities: ServiceTypeCapabilities | null;
  presentation: Record<string, unknown> | null;
  isActive: boolean;
  sortOrder: number;
  fields: ServiceTypeField[];
  _count?: { categories: number; listings: number };
}

export interface CreateServiceTypePayload {
  slug: string; name: string; nameAr: string; icon?: string | null;
  labels?: unknown; capabilities?: unknown; presentation?: unknown; sortOrder?: number; isActive?: boolean;
}
export type UpdateServiceTypePayload = Partial<CreateServiceTypePayload>;
export type CreateServiceTypeFieldPayload = Omit<ServiceTypeField, 'id' | 'serviceTypeId' | 'createdAt' | 'updatedAt'> & { serviceTypeId: string };
export type UpdateServiceTypeFieldPayload = Partial<Omit<CreateServiceTypeFieldPayload, 'serviceTypeId'>>;

export interface ServiceProviderServiceTypeProfile {
  id: string;
  providerId: string;
  serviceTypeId: string;
  attributes: Record<string, unknown> | null;
  isActive: boolean;
  serviceType: ServiceType;
}

export type ServiceBusinessType = 'INDIVIDUAL' | 'SMALL_BUSINESS';
export type ServiceAvailability = 'AVAILABLE' | 'BUSY' | 'UNAVAILABLE';
export type ServicePricingType = 'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE';
export type ServiceListingStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';
export type ServiceLocationType = 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE';
export type ServiceRequestStatus =
  | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
/** Action values accepted by PATCH /service-requests/:id/respond. PENDING is
 * never a valid target — only ever the creation default. */
export type ServiceRequestAction =
  | 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type AppointmentStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type WorkingHours = Record<
  'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat',
  { open: string; close: string } | null
>;

export interface ServiceProviderDetails {
  id: string;
  sellerProfileId: string;
  businessName: string;
  businessType: ServiceBusinessType;
  logoUrl: string | null;
  description: string;
  serviceAreaCities: string[];
  workingHours: WorkingHours;
  contactPhone: string;
  // UNIFY-PAYMENTS: no paymentMethods field here anymore — a provider's
  // payment methods are its parent SellerProfile.paymentMethods (see
  // ServiceProviderPublic.sellerProfile below). Managed only from the
  // seller's own profile page now.
  availabilityStatus: ServiceAvailability;
  completedRequestsCount: number;
  /** Prisma Decimal(5,2) — string in JSON, same convention as SellerProfile.averageRating. */
  fulfillmentRate: string | null;
  /** Optional pin for "nearby me" search — real schema field, not in services-design.md. */
  latitude: string | null;
  longitude: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /service-providers/:id — public page, includes parent seller trust data. */
export type ServiceProviderPublic = ServiceProviderDetails & {
  sellerProfile: Pick<SellerProfile, 'userId' | 'displayName' | 'avatarUrl' | 'verified' | 'trustScore' | 'averageRating' | 'totalRatings' | 'paymentMethods'>;
  listings: ServiceListing[];
  serviceTypeProfiles?: ServiceProviderServiceTypeProfile[];
};

/**
 * GET /service-providers/me/analytics — owner-only dashboard. Mirrors
 * StoreAnalytics's shape (types/store.types.ts) — same "views /
 * pipeline counts / top items" structure adapted to what a provider
 * has instead of a store's followers/promotions. Unlike
 * StoreAnalytics, `revenue` is included here since ServiceRequest.
 * agreedPrice is a real, existing field (no Order model needed).
 */
export interface ServiceProviderAnalytics {
  totalViews: number;
  activeListings: number;
  pendingRequests: number;
  completedRequests: number;
  /** Plain number here (not the Decimal-as-string convention
   * ServiceProviderDetails.fulfillmentRate uses) — this endpoint
   * computes it fresh in JS rather than passing through a Prisma
   * Decimal column. null when there's no terminal request history yet. */
  fulfillmentRate: number | null;
  upcomingAppointments: number;
  averageRating: number | null;
  reviewCount: number;
  revenue: number;
  topListings: { id: string; title: string; views: number; image: string | null }[];
  period: '7d' | '30d' | 'all';
}

export interface ServiceCategory {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  serviceTypeId: string;
  serviceType?: Pick<ServiceType, 'id' | 'slug' | 'nameAr' | 'icon'>;
  isActive: boolean;
  createdAt: string;
  // EPIC 1.2: only present on the admin listing (GET /service-categories/admin/all —
  // service-categories.repository.ts's findManyForAdmin), not on the public
  // GET /service-categories tree. Optional so the existing public-facing
  // callers of the base type keep compiling unchanged.
  children?: ServiceCategory[];
  _count?: { listings: number };
}

export interface CreateServiceCategoryPayload {
  name:      string;
  nameAr:    string;
  slug:      string;
  icon?:     string;
  parentId?: string;
  serviceTypeId?: string | null | undefined;
}

/** isActive is only ever settable via update — matches
 * service-categories.validation.ts's updateServiceCategorySchema, where
 * only PATCH accepts isActive (POST/create always defaults to active). */
export type UpdateServiceCategoryPayload = Partial<CreateServiceCategoryPayload> & {
  isActive?: boolean;
};

export interface ServiceListing {
  id: string;
  providerId: string;
  serviceTypeId: string;
  categoryId: string;
  title: string;
  description: string;
  images: string[];
  pricingType: ServicePricingType;
  /** Prisma Decimal(10,2) — string in JSON, or null when pricingType is NEGOTIABLE. */
  price: string | null;
  durationEstimate: string | null;
  serviceLocation: ServiceLocationType;
  attributes: Record<string, unknown> | null;
  serviceType?: Pick<ServiceType, 'id' | 'slug' | 'nameAr' | 'icon' | 'capabilities' | 'presentation'> & { fields?: ServiceTypeField[] };
  status: ServiceListingStatus;
  views: number;
  createdAt: string;
  updatedAt: string;
}

/** Listing card in browse/search results — includes provider summary to avoid N+1 fetches. */
export type ServiceListingWithProvider = ServiceListing & {
  provider: Pick<
    ServiceProviderDetails,
    'id' | 'businessName' | 'logoUrl' | 'availabilityStatus' | 'serviceAreaCities' | 'contactPhone'
  > & {
    // Epic 3.1: userId added so ServiceRequestButton can hide itself on
    // one's own listing — same self-request guard as ads/sellers already have.
    // UNIFY-PAYMENTS: paymentMethods added so ServiceListingDetail can
    // read it here instead of the now-removed provider.paymentMethods.
    sellerProfile: Pick<SellerProfile, 'userId' | 'displayName' | 'verified' | 'averageRating' | 'paymentMethods'>;
  };
};

export interface ServiceRequest {
  id: string;
  listingId: string;
  customerId: string;
  status: ServiceRequestStatus;
  details: string;
  attachedImages: string[];
  /** Prisma Decimal(10,2) — string in JSON, or null until quoted/agreed. */
  quotedPrice: string | null;
  agreedPrice: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  // Epic 3.1: verified against service-requests.repository.ts's
  // `requestWithRelations` — every list/detail endpoint always includes
  // these two relations (there is no "bare" ServiceRequest response on
  // the wire), so they're required here rather than optional.
  listing: Pick<ServiceListing, 'id' | 'title' | 'images' | 'providerId'> & {
    provider: Pick<ServiceProviderDetails, 'id' | 'businessName'> & {
      sellerProfile: Pick<SellerProfile, 'userId' | 'displayName'>;
    };
  };
  customer: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  // Epic 3.2/3.3: added to service-requests.repository.ts's
  // requestWithRelations include so the UI can show "reviewed" without
  // a second request — null until the customer submits a ServiceReview
  // for this request (unique per requestId, so at most one ever exists).
  review: { id: string } | null;
}

export interface Appointment {
  id: string;
  providerId: string;
  requestId: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceReview {
  id: string;
  score: number;
  comment: string | null;
  requestId: string;
  raterId: string;
  sellerProfileId: string;
  createdAt: string;
  // Epic 3.2/3.3: verified against service-reviews.repository.ts's
  // `ServiceReviewWithRater` — GET /service-reviews/seller/:id always
  // includes this relation (there is no bare-review list response), so
  // it's required rather than optional. POST /service-reviews response
  // (createReview) returns the bare Prisma row without it, but the
  // create flow never renders the review it just created — it redirects
  // to the seller's review list, which refetches through the paginated
  // endpoint and gets the full shape.
  rater: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

// ── Payloads ─────────────────────────────────────────────────────

/** POST /service-providers/me. */
export interface CreateServiceProviderPayload {
  businessName: string;
  businessType: ServiceBusinessType;
  description: string;
  serviceAreaCities: string[];
  workingHours: WorkingHours;
  contactPhone: string;
  logoUrl?: string;
  latitude?: number;
  longitude?: number;
}

/** PATCH /service-providers/me. */
export type UpdateServiceProviderPayload = Partial<CreateServiceProviderPayload> & {
  availabilityStatus?: ServiceAvailability;
};

/**
 * Phase 3: GET /service-providers query params — public city/browse
 * directory. Mirrors StoresQuery/AdSearchParams' city-optional shape;
 * omitted city means general/unfiltered, never an error.
 */
export interface ServiceProvidersQuery {
  page?: number;
  limit?: number;
  city?: string;
}

/** GET /service-providers/nearby query params — real endpoint, no plan equivalent. */
export interface NearbyServiceProvidersParams {
  lat: number;
  lng: number;
  /** km, server default 10, capped 100. */
  radius?: number;
  page?: number;
  limit?: number;
}

// Epic 4.3: verified against service-providers.repository.ts's
// NearbyServiceProviderRow — GET /service-providers/nearby returns bare
// ServiceProviderDetails rows plus a computed distanceKm, with no
// sellerProfile join (unlike ServiceListingWithProvider). A nearby-search
// card therefore only has businessName/logoUrl/availabilityStatus/
// distance to show — not the seller's displayName or rating.
export type NearbyServiceProviderRow = ServiceProviderDetails & {
  distanceKm: number;
};

/** POST /service-listings (multipart/form-data — images come from files, not this payload). */
export interface CreateServiceListingPayload {
  serviceTypeId: string;
  categoryId: string;
  title: string;
  description: string;
  pricingType: ServicePricingType;
  /** Required when pricingType is FIXED or STARTING_FROM; omit for NEGOTIABLE. */
  price?: number;
  durationEstimate?: string;
  attributes?: Record<string, unknown>;
  serviceLocation: ServiceLocationType;
  images: File[];
}

/** PATCH /service-listings/:id — JSON, not multipart. The backend's update
 * schema has no images field at all — images are only ever mutated through
 * the dedicated POST/DELETE /service-listings/:id/images endpoints
 * (Gap #3 fix), same convention as ads' /ads/:id/images routes. */
export interface UpdateServiceListingPayload {
  serviceTypeId?: string;
  categoryId?: string;
  title?: string;
  description?: string;
  pricingType?: ServicePricingType;
  price?: number | null;
  durationEstimate?: string | null;
  attributes?: Record<string, unknown>;
  serviceLocation?: ServiceLocationType;
  status?: ServiceListingStatus;
}

export type ServiceListingSortField = 'createdAt' | 'price' | 'views';

export interface ServiceListingsQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  serviceTypeId?: string;
  providerId?: string;
  city?: string;
  serviceLocation?: ServiceLocationType;
  minPrice?: number;
  maxPrice?: number;
  /** JSON-encoded map of dynamic listing attributes used by service search. */
  attributeFilters?: Record<string, unknown>;
  search?: string;
  sortBy?: ServiceListingSortField;
  sortOrder?: 'asc' | 'desc';
  /** Used by my-listings (GET /service-listings/me); ignored by the public browse endpoint. */
  status?: ServiceListingStatus;
}

/** POST /service-requests. */
export interface CreateServiceRequestPayload {
  listingId: string;
  details: string;
  attachedImages?: string[];
}

/** PATCH /service-requests/:id/respond. */
export interface RespondToServiceRequestPayload {
  action: ServiceRequestAction;
  quotedPrice?: number;
  agreedPrice?: number;
}

export interface ServiceRequestsQuery {
  page?: number;
  limit?: number;
  status?: ServiceRequestStatus;
}

/** POST /service-reviews. */
export interface CreateServiceReviewPayload {
  requestId: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

/** POST /appointments. */
export interface CreateAppointmentPayload {
  requestId?: string;
  /** ISO datetime — must be in the future. */
  scheduledStart: string;
  scheduledEnd: string;
  notes?: string;
}

/** PATCH /appointments/:id/status — only these three are ever posted here;
 * SCHEDULED is only the creation default. */
export type UpdateAppointmentStatusPayload = {
  status: Exclude<AppointmentStatus, 'SCHEDULED'>;
};

export interface AppointmentsQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

/** A single free time range within a day, as returned inside
 * AvailabilityResponse.freeRanges — ISO datetime strings. */
export interface AvailabilitySlot {
  start: string;
  end: string;
}

/** GET /appointments/availability/:providerId?date=YYYY-MM-DD.
 * Verified against appointments.service.ts's getAvailability: derived
 * (not a stored "Slots" table) from the provider's workingHours for that
 * weekday minus any SCHEDULED appointments already booked in that
 * window. `available` is a convenience flag equal to freeRanges.length > 0
 * (false, with an empty freeRanges array, on a day outside workingHours). */
export interface AvailabilityResponse {
  date: string;
  available: boolean;
  freeRanges: AvailabilitySlot[];
}

/** Mirrors backend/prisma/schema.prisma's ServiceQuoteStatus enum. */
export type ServiceQuoteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';

// ── Service listing create/edit form values ─────────────────────
// DESKTOP-AUDIT-05: moved here from ServiceListingForm.tsx (colocated
// originally) to match AdFormValues' own home in ad.types.ts — lets
// ServiceListingFormPreview import the type without a circular import
// back through the form component itself.
export interface ServiceListingFormValues {
  serviceTypeId: string;
  categoryId: string;
  title: string;
  description: string;
  pricingType: ServicePricingType;
  price: string;
  durationEstimate: string;
  attributes: Record<string, unknown>;
  serviceLocation: ServiceLocationType;
  images: File[];           // new uploads staged for this submit
  existingImages: string[]; // URLs already on server (edit mode)
}
