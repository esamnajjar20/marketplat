/**
 * MarketPlat's single source of truth for filter/query-string behavior.
 *
 * This module is deliberately framework- and platform-independent so the
 * Next.js frontend and Expo app use the same normalization, serialization,
 * update, clear, and active-count rules.
 */

export type FilterValue = string | number | boolean | null | undefined;
export type FilterPatch = Readonly<Record<string, FilterValue>>;

export interface UpdateFilterOptions {
  /** Additional query keys to remove before applying the patch. */
  clearKeys?: readonly string[];
  /** Reset pagination whenever a filter changes. Defaults to true. */
  resetPage?: boolean;
  /** Page key to reset. Defaults to `page`. */
  pageKey?: string;
  /** Trim string values before writing them. Defaults to true. */
  trimStrings?: boolean;
  /** Optional allow-list supplied by a page profile to reject unknown keys. */
  allowedKeys?: readonly string[];
}

export interface ActiveFilterConfig {
  /** Parameters that each represent one filter when populated. */
  keys: readonly string[];
  /** Full API/query contract accepted by this surface (may include non-counted keys). */
  params?: readonly string[];
  /** URL-only keys used for UI context; never serialized into list API requests. */
  contextKeys?: readonly string[];
  /** Parameter groups counted once when any member is populated (e.g. lat/lng). */
  groups?: readonly (readonly string[])[];
  /** Values that represent a default/unfiltered state for a specific key. */
  ignoredValues?: Readonly<Record<string, readonly string[]>>;
}

export interface BuildFilterParamsOptions {
  /** Include empty/null values instead of omitting them. Defaults to false. */
  includeEmpty?: boolean;
  /** Trim strings before serializing. Defaults to true. */
  trimStrings?: boolean;
  /** Restrict serialization to the canonical parameters of a page profile. */
  profile?: FilterProfile;
  /** Additional explicitly permitted API parameters (for example providerId). */
  extraKeys?: readonly string[];
}

function toParamValue(value: FilterValue, trimStrings = true): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const normalized = trimStrings ? value.trim() : value;
    return normalized === '' ? null : normalized;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  return String(value);
}

/** Create URLSearchParams from a filter object using the shared empty-value rules. */
export function buildFilterParams(
  values: FilterPatch,
  options: BuildFilterParamsOptions = {},
): URLSearchParams {
  const params = new URLSearchParams();
  const trimStrings = options.trimStrings !== false;
  const profileConfig = options.profile
    ? FILTER_PROFILES[options.profile] as ActiveFilterConfig
    : null;
  const allowedKeys = profileConfig
    ? new Set([
      ...(profileConfig.params ?? profileConfig.keys),
      'page',
      'limit',
      ...(options.extraKeys ?? []),
    ])
    : null;

  for (const [key, value] of Object.entries(values)) {
    if (allowedKeys && !allowedKeys.has(key)) continue;
    const normalized = toParamValue(value, trimStrings);
    if (normalized === null) {
      if (options.includeEmpty) params.set(key, '');
      continue;
    }
    params.set(key, normalized);
  }

  return params;
}

/** Apply a filter patch while preserving every unrelated query parameter. */
export function updateFilterParams(
  current: URLSearchParams | string,
  updates: FilterPatch,
  options: UpdateFilterOptions = {},
): URLSearchParams {
  const params = new URLSearchParams(
    typeof current === 'string' ? current.replace(/^\?/, '') : current.toString(),
  );

  for (const key of options.clearKeys ?? []) params.delete(key);

  const trimStrings = options.trimStrings !== false;
  const allowedKeys = options.allowedKeys ? new Set(options.allowedKeys) : null;
  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys && !allowedKeys.has(key)) continue;
    const normalized = toParamValue(value, trimStrings);
    if (normalized === null) params.delete(key);
    else params.set(key, normalized);
  }

  if (options.resetPage !== false) params.delete(options.pageKey ?? 'page');
  return params;
}

/** Remove selected filter parameters and, by default, return pagination to page 1. */
export function removeFilterParams(
  current: URLSearchParams | string,
  keys: readonly string[],
  options: Pick<UpdateFilterOptions, 'resetPage' | 'pageKey'> = {},
): URLSearchParams {
  const params = new URLSearchParams(
    typeof current === 'string' ? current.replace(/^\?/, '') : current.toString(),
  );
  for (const key of keys) params.delete(key);
  if (options.resetPage !== false) params.delete(options.pageKey ?? 'page');
  return params;
}

/** Keep only the explicitly preserved parameters, usually search/type/tab. */
export function clearFilterParams(
  current: URLSearchParams | string,
  preserveKeys: readonly string[] = [],
): URLSearchParams {
  const source = new URLSearchParams(
    typeof current === 'string' ? current.replace(/^\?/, '') : current.toString(),
  );
  const result = new URLSearchParams();
  for (const key of preserveKeys) {
    for (const value of source.getAll(key)) result.append(key, value);
  }
  return result;
}

function hasActiveValue(params: URLSearchParams, key: string, ignoredValues: readonly string[] = []): boolean {
  const value = params.get(key);
  return value !== null && value.trim() !== '' && !ignoredValues.includes(value);
}

/** Count active filters consistently, excluding configured defaults. */
export function countConfiguredFilters(
  params: URLSearchParams,
  config: ActiveFilterConfig,
): number {
  const groupedKeys = new Set((config.groups ?? []).flat());
  let count = 0;

  for (const key of config.keys) {
    if (groupedKeys.has(key)) continue;
    if (hasActiveValue(params, key, config.ignoredValues?.[key])) count += 1;
  }

  for (const group of config.groups ?? []) {
    const active = group.some((key) =>
      hasActiveValue(params, key, config.ignoredValues?.[key]),
    );
    if (active) count += 1;
  }

  return count;
}

/** Build a href without producing a dangling `?`. */
export function buildFilterHref(basePath: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Build a URLSearchParams from an existing query string (accepts an optional `?`). */
export function parseFilterParams(query: string | URLSearchParams): URLSearchParams {
  return new URLSearchParams(
    typeof query === 'string' ? query.replace(/^\?/, '') : query.toString(),
  );
}

/** Stable serialization for API/cache query keys. */
export function serializeFilterParams(params: URLSearchParams): string {
  return params.toString();
}

/** Extract a filtered subset while retaining the original query parameter order. */
export function pickFilterParams(
  current: URLSearchParams | string,
  keys: readonly string[],
): URLSearchParams {
  const source = parseFilterParams(current);
  const result = new URLSearchParams();
  for (const key of keys) {
    for (const value of source.getAll(key)) result.append(key, value);
  }
  return result;
}

/**
 * Canonical filter contracts for every first-party listing surface.
 * Page components may add domain fields, but the shared profile is the
 * authoritative list of URL keys, grouped controls and inactive defaults.
 */
export const FILTER_PROFILES = {
  adsBrowse: {
    keys: ['search', 'city', 'categoryId', 'condition', 'minPrice', 'maxPrice', 'sortBy', 'sortOrder'],
    params: ['search', 'q', 'city', 'categoryId', 'condition', 'minPrice', 'maxPrice', 'sortBy', 'sortOrder', 'storeId', 'isFeatured', 'page', 'limit'],
    groups: [['minPrice', 'maxPrice'], ['sortBy', 'sortOrder']],
    ignoredValues: { sortBy: ['createdAt'], sortOrder: ['desc'] },
  },
  adsCategoryBrowse: {
    keys: ['search', 'city', 'condition', 'minPrice', 'maxPrice', 'sortBy', 'sortOrder'],
    groups: [['minPrice', 'maxPrice'], ['sortBy', 'sortOrder']],
    ignoredValues: { sortBy: ['createdAt'], sortOrder: ['desc'] },
  },
  productsBrowse: {
    keys: ['search', 'city', 'categoryId', 'availability', 'hasPromotion', 'minPrice', 'maxPrice', 'sortBy', 'sortOrder'],
    params: ['search', 'city', 'categoryId', 'availability', 'hasPromotion', 'minPrice', 'maxPrice', 'sortBy', 'sortOrder', 'storeId', 'page', 'limit'],
    groups: [['minPrice', 'maxPrice'], ['sortBy', 'sortOrder']],
    ignoredValues: { sortBy: ['createdAt'], sortOrder: ['desc'] },
  },
  servicesBrowse: {
    keys: ['search', 'serviceTypeId', 'categoryId', 'city', 'serviceLocation', 'minPrice', 'maxPrice', 'attributeFilters', 'sortBy', 'sortOrder'],
    params: ['search', 'serviceTypeId', 'categoryId', 'providerId', 'city', 'serviceLocation', 'minPrice', 'maxPrice', 'attributeFilters', 'sortBy', 'sortOrder', 'page', 'limit'],
    groups: [['minPrice', 'maxPrice'], ['sortBy', 'sortOrder']],
    ignoredValues: { sortBy: ['createdAt'], sortOrder: ['desc'] },
  },
  storesBrowse: {
    keys: ['search', 'city', 'type', 'sortBy', 'sortOrder'],
    groups: [['sortBy', 'sortOrder']],
    ignoredValues: { sortBy: ['createdAt'], sortOrder: ['desc'] },
  },
  globalSearch: {
    keys: ['city', 'categoryId', 'minPrice', 'maxPrice', 'condition', 'sort', 'lat', 'lng'],
    contextKeys: ['focus'],
    params: ['q', 'type', 'city', 'categoryId', 'minPrice', 'maxPrice', 'condition', 'sort', 'lat', 'lng', 'radius', 'page', 'limit'],
    groups: [['minPrice', 'maxPrice'], ['lat', 'lng']],
    ignoredValues: { sort: ['relevance'] },
  },
  openRequests: {
    keys: ['type', 'city', 'serviceTypeId', 'q', 'sort'],
    params: ['type', 'city', 'serviceTypeId', 'categoryId', 'q', 'sort', 'page', 'limit'],
    ignoredValues: { sort: ['newest'] },
  },
  myAds: {
    keys: ['status', 'q'],
  },
  myProducts: {
    keys: ['status', 'availability', 'q'],
    params: ['status', 'availability', 'q', 'search', 'storeId', 'categoryId', 'sortBy', 'sortOrder', 'page', 'limit'],
  },
  myServices: {
    keys: ['status', 'q'],
    params: ['status', 'q', 'search', 'sortBy', 'sortOrder', 'page', 'limit'],
  },
  myServiceRequests: { keys: ['status'], params: ['status', 'page', 'limit'] },
  incomingServiceRequests: { keys: ['status'], params: ['status', 'page', 'limit'] },
  myOpenRequests: { keys: ['status'], params: ['status', 'page', 'limit'] },
  myRequestOffers: { keys: ['status'], params: ['status', 'page', 'limit'] },
  favorites: {
    keys: ['type', 'list'],
    params: ['type', 'list', 'listId', 'page', 'limit'],
    ignoredValues: { type: ['ad'] },
  },
  storeInventory: {
    keys: ['stock', 'q'],
    params: ['stock', 'q', 'page', 'limit'],
  },
  storeProducts: {
    keys: ['sort', 'q'],
    params: ['sort', 'q', 'page', 'limit'],
    ignoredValues: { sort: ['newest'] },
  },
  appointments: { keys: ['status'], params: ['status', 'from', 'to', 'page', 'limit'] },
  adminAds: { keys: ['q', 'status'], params: ['q', 'status', 'userId', 'page', 'limit'] },
  adminUsers: { keys: ['q'], params: ['q', 'isActive', 'page', 'limit'] },
  adminStores: { keys: ['q', 'status', 'featureRequested'], params: ['q', 'status', 'featureRequested', 'page', 'limit'], ignoredValues: { status: ['PENDING'] } },
  adminReports: { keys: ['status', 'targetType'], params: ['status', 'targetType', 'page', 'limit'], ignoredValues: { status: ['PENDING'] } },
  adminAuditLogs: { keys: ['userId', 'event', 'from', 'to'], params: ['userId', 'event', 'from', 'to', 'sortBy', 'sortOrder', 'page', 'limit'] },
  adminFlaggedAds: { keys: [], params: ['page', 'limit'] },
  adminFraudSignals: { keys: ['type', 'userId', 'adId', 'reviewed'], params: ['type', 'userId', 'adId', 'reviewed', 'page', 'limit'] },
  adminServiceRequestDisputes: { keys: [], params: ['page', 'limit'] },
  adminSellers: { keys: ['q', 'verification'], params: ['q', 'verified', 'suspended', 'verificationStatus', 'page', 'limit'], ignoredValues: { verification: ['ALL'] } },
  adminProducts: { keys: ['q', 'status'], params: ['q', 'status', 'page', 'limit'], ignoredValues: { status: ['ACTIVE', 'ALL'] } },
  adminServiceListings: { keys: ['q', 'status'], params: ['q', 'status', 'page', 'limit'], ignoredValues: { status: ['ACTIVE', 'ALL'] } },
  adminOpenRequests: { keys: ['q', 'status'], params: ['q', 'status', 'type', 'page', 'limit'], ignoredValues: { status: ['OPEN', 'ALL'] } },
  serviceProviders: { keys: ['city'], params: ['city', 'page', 'limit'] },
  providerServices: { keys: [], params: ['providerId', 'page', 'limit', 'sortBy', 'sortOrder'] },
  customers: { keys: ['q', 'dueOnly'], params: ['q', 'dueOnly', 'page', 'limit'] },
  providerDashboard: { keys: ['status', 'search'], params: ['period', 'status', 'search', 'page', 'limit'] },
  providerAnalytics: { keys: ['period'], params: ['period'] },
  activity: { keys: ['group', 'q'], params: ['group', 'q', 'type', 'page', 'limit'] },
  salesCostProducts: { keys: ['q'], params: ['q', 'page', 'limit'] },
  salesBrowse: { keys: ['status', 'entityType', 'customerId', 'storeId', 'from', 'to'], params: ['status', 'entityType', 'customerId', 'storeId', 'from', 'to', 'page', 'limit'] },
  salesReports: { keys: ['status', 'from', 'to'], params: ['status', 'from', 'to', 'storeId', 'page', 'limit'] },
  salesChart: { keys: ['from', 'to', 'period'], params: ['from', 'to', 'period'] },
  marketplaceOrders: { keys: ['status'], params: ['status', 'page', 'limit'] },
  conversations: { keys: ['archivedOnly', 'includeArchived'], params: ['archivedOnly', 'includeArchived', 'role', 'page', 'limit'] },
  notifications: { keys: ['unreadOnly'], params: ['unreadOnly', 'type', 'category', 'page', 'limit'] },
  promotions: { keys: ['storeId'], params: ['storeId', 'page', 'limit'] },
  homeFeed: { keys: ['city'], params: ['city'] },
  serviceProvidersNearby: { keys: ['lat', 'lng', 'radius'], params: ['lat', 'lng', 'radius', 'page', 'limit'], groups: [['lat', 'lng']] },
  salesDebts: { keys: [], params: ['page', 'limit'] },
  salesSummary: { keys: ['period'], params: ['period'] },
  appointmentAvailability: { keys: ['date'], params: ['date'] },
  publicProfileAds: { keys: [], params: ['page', 'limit'] },
  followingFeed: { keys: [], params: ['page', 'limit'] },
  followList: { keys: [], params: ['page', 'limit'] },
  blockedUsers: { keys: [], params: ['page', 'limit'] },
  myReports: { keys: [], params: ['page', 'limit'] },
  sellerRatings: { keys: [], params: ['page', 'limit'] },
  serviceReviews: { keys: [], params: ['page', 'limit'] },
  storeReviews: { keys: [], params: ['page', 'limit'] },
  followedStores: { keys: [], params: ['page', 'limit'] },
  storeMembers: { keys: [], params: ['page', 'limit'] },
  myFollowing: { keys: ['type'], params: ['type', 'page', 'limit'] },
  serviceMatches: { keys: [], params: ['limit'] },
  sellerRanking: { keys: [], params: ['limit'] },
  recommendations: { keys: [], params: ['type', 'limit', 'city', 'lat', 'lng', 'excludeAdId', 'excludeProductId', 'excludeServiceListingId', 'excludeStoreId', 'serviceTypeId'] },
} as const satisfies Readonly<Record<string, ActiveFilterConfig>>;

export type FilterProfile = keyof typeof FILTER_PROFILES;

export function getFilterProfile(profile: FilterProfile): ActiveFilterConfig {
  return FILTER_PROFILES[profile];
}

/** Normalize user-supplied pagination consistently before it reaches an API. */
export function normalizeFilterPage(value: string | number | null | undefined, fallback = 1, maximum = 10_000): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

/** Parse a string enum only when it is included in the allowed values. */
export function parseFilterEnum<const T extends readonly string[]>(
  value: string | null | undefined,
  allowed: T,
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? value as T[number] : undefined;
}
