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
  sellerProfile: Pick<SellerProfile, 'userId' | 'displayName' | 'avatarUrl' | 'verified' | 'trustScore' | 'averageRating' | 'totalRatings'>;
  listings: ServiceListing[];
};

export interface ServiceCategory {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
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
  categoryId: string;
  title: string;
  description: string;
  images: string[];
  pricingType: ServicePricingType;
  /** Prisma Decimal(10,2) — string in JSON, or null when pricingType is NEGOTIABLE. */
  price: string | null;
  durationEstimate: string | null;
  serviceLocation: ServiceLocationType;
  status: ServiceListingStatus;
  views: number;
  createdAt: string;
  updatedAt: string;
}

/** Listing card in browse/search results — includes provider summary to avoid N+1 fetches. */
export type ServiceListingWithProvider = ServiceListing & {
  provider: Pick<ServiceProviderDetails, 'id' | 'businessName' | 'logoUrl' | 'availabilityStatus'> & {
    // Epic 3.1: userId added so ServiceRequestButton can hide itself on
    // one's own listing — same self-request guard as ads/sellers already have.
    sellerProfile: Pick<SellerProfile, 'userId' | 'displayName' | 'verified' | 'averageRating'>;
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
  categoryId: string;
  title: string;
  description: string;
  pricingType: ServicePricingType;
  /** Required when pricingType is FIXED or STARTING_FROM; omit for NEGOTIABLE. */
  price?: number;
  durationEstimate?: string;
  serviceLocation: ServiceLocationType;
  images: File[];
}

/** PATCH /service-listings/:id — JSON, not multipart. The backend's update
 * schema has no images field at all — images are only ever mutated through
 * the dedicated POST/DELETE /service-listings/:id/images endpoints
 * (Gap #3 fix), same convention as ads' /ads/:id/images routes. */
export interface UpdateServiceListingPayload {
  categoryId?: string;
  title?: string;
  description?: string;
  pricingType?: ServicePricingType;
  price?: number | null;
  durationEstimate?: string | null;
  serviceLocation?: ServiceLocationType;
  status?: ServiceListingStatus;
}

export type ServiceListingSortField = 'createdAt' | 'price' | 'views';

export interface ServiceListingsQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  providerId?: string;
  city?: string;
  serviceLocation?: ServiceLocationType;
  minPrice?: number;
  maxPrice?: number;
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
