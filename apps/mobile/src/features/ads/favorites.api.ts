import { apiRequest } from '@/api/client';

export type FavoriteRecord = {
  id: string;
  adId: string;
  ad?: { id: string; title?: string };
};

type Envelope<T> = { success: boolean; data?: T; meta?: { pagination?: { totalPages?: number } } };

/** Uses the existing authenticated /api/v1/favorites contract. */
export async function fetchFavoriteAdIds(token: string): Promise<string[]> {
  const ids = new Set<string>();
  // The API is paginated; walk pages so accounts with more than one page are not truncated.
  for (let page = 1; page <= 100; page += 1) {
    const response = await apiRequest<Envelope<FavoriteRecord[]>>(
      `/api/v1/favorites?page=${page}&limit=100`,
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
