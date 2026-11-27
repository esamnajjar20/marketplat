import type { ApiEnvelope as SharedApiEnvelope } from '@/api/contracts';
import { buildFilterParams } from '../../../../../shared/filters';
import { apiRequest } from '@/api/client';

export type FavoriteRecord = {
  id: string;
  adId: string;
  createdAt?: string;
  ad?: { id: string; title?: string; price?: number | string | null; images?: string[]; city?: string; isNegotiable?: boolean; createdAt?: string; category?: { id: string; name?: string; nameAr?: string | null } | null; user?: { id: string; name?: string | null; city?: string | null } | null };
};

type Envelope<T> = SharedApiEnvelope<T>;

export type FavoritePage<T> = { items: T[]; page: number; totalPages: number; total: number };

function favoritePage<T>(response: Envelope<T[]>, page: number, fallback: string): FavoritePage<T> {
  if (response?.success !== true || !Array.isArray(response.data)) throw new Error(response?.message || fallback);
  const pagination = response.meta?.pagination;
  const total = pagination?.total ?? response.data.length;
  return {
    items: response.data,
    page: pagination?.page ?? page,
    totalPages: pagination?.totalPages ?? (response.data.length >= 20 ? page + 1 : page),
    total,
  };
}

/** Uses the existing authenticated /api/v1/favorites contract. */
export async function fetchFavoriteAdIds(token: string): Promise<string[]> {
  const ids = new Set<string>();
  // The API is paginated; walk pages so accounts with more than one page are not truncated.
  for (let page = 1; page <= 100; page += 1) {
    const response = await apiRequest<Envelope<FavoriteRecord[]>>(
      `/api/v1/favorites?${buildFilterParams({ page, limit: 100 }, { profile: 'favorites' })}`,
      { token },
    );
    if (response?.success !== true || !Array.isArray(response.data)) {
      throw new Error('استجابة المفضلة من الخادم غير متوقعة.');
    }
    for (const item of response.data) {
      const id = typeof item.adId === 'string' ? item.adId : item.ad?.id;
      if (id) ids.add(id);
    }
    const totalPages = response.meta?.pagination?.totalPages;
    if (typeof totalPages === 'number' ? page >= totalPages : response.data.length < 100) break;
  }
  return [...ids];
}

/** Server-confirmed toggle. Caller should update local state only after this resolves. */
export async function toggleFavoriteAd(
  adId: string,
  token: string,
  csrfToken?: string | null,
): Promise<'added' | 'removed'> {
  if (!adId.trim()) throw new Error('معرّف الإعلان غير صالح.');
  const response = await apiRequest<Envelope<{ action?: 'added' | 'removed' }>>(
    `/api/v1/favorites/${encodeURIComponent(adId)}`,
    {
      method: 'POST',
      token,
      ...(csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : {}),
      body: JSON.stringify({}),
    },
  );
  const action = response?.data?.action;
  if (response?.success !== true || (action !== 'added' && action !== 'removed')) {
    throw new Error('لم يؤكد الخادم تحديث المفضلة.');
  }
  return action;
}

/** Set an explicit desired state. This endpoint is safe to replay after a lost acknowledgement. */
export async function setFavoriteAdState(
  adId: string,
  favorited: boolean,
  token: string,
  operationId: string,
  csrfToken?: string | null,
): Promise<boolean> {
  if (!adId.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)) {
    throw new Error('بيانات تحديث المفضلة غير صالحة.');
  }
  const response = await apiRequest<Envelope<{ isFavorited?: boolean }>>(
    `/api/v1/favorites/${encodeURIComponent(adId)}/state`,
    {
      method: 'PUT', token,
      headers: { 'X-Offline-Op-Id': operationId, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
      body: JSON.stringify({ favorited }),
    },
  );
  if (response?.success !== true || response.data?.isFavorited !== favorited) {
    throw new Error('لم يؤكد الخادم حالة المفضلة المطلوبة.');
  }
  return response.data.isFavorited;
}


/** Fetch only one page of ad favorites; the screen requests more as the user scrolls. */
export async function fetchFavoriteAdsPage(
  token: string,
  page = 1,
  limit = 20,
): Promise<FavoritePage<FavoriteRecord>> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const response = await apiRequest<Envelope<FavoriteRecord[]>>(
    `/api/v1/favorites?${buildFilterParams({ page: safePage, limit: safeLimit }, { profile: 'favorites' })}`,
    { token },
  );
  const result = favoritePage(response, safePage, 'استجابة المفضلة من الخادم غير متوقعة.');
  return {
    ...result,
    items: result.items.filter((item) => typeof item?.adId === 'string' && item.ad && typeof item.ad.id === 'string'),
  };
}

export type FavoriteEntityType = 'ads' | 'products' | 'stores' | 'services';
export type FavoriteEntityQueryType = 'product' | 'store' | 'service';
export type FavoriteEntityValue = {
  id: string;
  name?: string;
  title?: string;
  description?: string | null;
  price?: number | string | null;
  pricingType?: string | null;
  images?: string[] | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  city?: string | null;
  address?: string | null;
  category?: { id?: string; name?: string; nameAr?: string | null } | null;
  store?: { name?: string | null; city?: string | null } | null;
  provider?: { businessName?: string | null; city?: string | null; sellerProfile?: { displayName?: string | null } | null } | null;
  effectivePrice?: { price?: number | string | null; amount?: number | string | null } | null;
};
export type FavoriteEntityRecord = {
  id: string;
  entityType: 'PRODUCT' | 'STORE' | 'SERVICE_LISTING';
  entityId: string;
  createdAt?: string;
  entity: FavoriteEntityValue;
};

/** Uses the backend's per-type response shape and database pagination. */
export async function fetchFavoriteEntityPage(
  type: FavoriteEntityQueryType,
  token: string,
  page = 1,
  limit = 20,
): Promise<FavoritePage<FavoriteEntityRecord>> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const params = buildFilterParams({ type, page: safePage, limit: safeLimit }, { profile: 'favorites' });
  const response = await apiRequest<Envelope<FavoriteEntityRecord[]>>(`/api/v1/favorites?${params.toString()}`, { token });
  const result = favoritePage(response, safePage, 'تعذر تحميل هذا النوع من المفضلة.');
  return {
    ...result,
    items: result.items.filter((item) => typeof item?.entityId === 'string' && item.entity && typeof item.entity.id === 'string'),
  };
}

/** Use the backend's existing polymorphic favorite endpoint (no per-card list fetches). */
export async function checkFavoriteEntity(
  entityType: FavoriteEntityType, entityId: string, token: string,
): Promise<boolean> {
  if (!entityId.trim()) throw new Error('معرّف المحتوى غير صالح.');
  const response = await apiRequest<Envelope<{ isFavorited?: boolean }>>(
    `/api/v1/favorites/${entityType}/${encodeURIComponent(entityId)}/check`, { token },
  );
  if (response?.success !== true || typeof response.data?.isFavorited !== 'boolean') {
    throw new Error('تعذر التحقق من حالة المفضلة.');
  }
  return response.data.isFavorited;
}

export async function toggleFavoriteEntity(
  entityType: FavoriteEntityType, entityId: string, token: string, csrfToken?: string | null,
): Promise<'added' | 'removed'> {
  if (!entityId.trim()) throw new Error('معرّف المحتوى غير صالح.');
  const response = await apiRequest<Envelope<{ action?: 'added' | 'removed' }>>(
    `/api/v1/favorites/${entityType}/${encodeURIComponent(entityId)}`, {
      method: 'POST', token,
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      body: JSON.stringify({}),
    },
  );
  const action = response?.data?.action;
  if (response?.success !== true || (action !== 'added' && action !== 'removed')) {
    throw new Error('لم يؤكد الخادم تحديث المفضلة.');
  }
  return action;
}

/** Explicit desired-state write; retrying it cannot invert a favorite state. */
export async function setFavoriteEntityState(
  entityType: FavoriteEntityType,
  entityId: string,
  favorited: boolean,
  token: string,
  csrfToken?: string | null,
): Promise<boolean> {
  if (!entityId.trim() || typeof favorited !== 'boolean') throw new Error('بيانات تحديث المفضلة غير صالحة.');
  const response = await apiRequest<Envelope<{ action?: 'added' | 'removed'; isFavorited?: boolean }>>(
    `/api/v1/favorites/${entityType}/${encodeURIComponent(entityId)}/state`, {
      method: 'PUT', token,
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      body: JSON.stringify({ favorited }),
    },
  );
  if (response?.success !== true || response.data?.isFavorited !== favorited) {
    throw new Error('لم يؤكد الخادم حالة المفضلة المطلوبة.');
  }
  return response.data.isFavorited;
}
