import { apiRequest } from '@/api/client';
import { readPublicCache, writePublicCache } from '@/storage/public-cache';

export type PublicCategory = {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  parentId?: string | null;
  children?: PublicCategory[];
};

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

const CATEGORY_MEMORY_TTL_MS = 5 * 60 * 1000;
let memoryCache: { items: PublicCategory[]; savedAt: number } | null = null;
let inFlight: Promise<PublicCategory[]> | null = null;

/** Read saved categories immediately for local-first rendering. */
export async function getCachedPublicCategories(): Promise<PublicCategory[] | null> {
  if (memoryCache && Date.now() - memoryCache.savedAt < CATEGORY_MEMORY_TTL_MS) {
    return memoryCache.items;
  }
  const cached = await readPublicCache<PublicCategory[]>('categories');
  if (Array.isArray(cached)) {
    memoryCache = { items: cached, savedAt: Date.now() };
    return cached;
  }
  return null;
}

/** Uses the existing public GET /api/v1/categories tree with a shared TTL and request de-duplication. */
export async function fetchPublicCategories(options: { forceRefresh?: boolean } = {}): Promise<PublicCategory[]> {
  if (!options.forceRefresh && memoryCache && Date.now() - memoryCache.savedAt < CATEGORY_MEMORY_TTL_MS) {
    return memoryCache.items;
  }
  if (inFlight) return inFlight;

  const request = (async () => {
    let response: ApiEnvelope<PublicCategory[]>;
    try {
      response = await apiRequest<ApiEnvelope<PublicCategory[]>>('/api/v1/categories');
    } catch (error) {
      const cached = memoryCache?.items ?? await readPublicCache<PublicCategory[]>('categories');
      if (cached && Array.isArray(cached)) {
        memoryCache = { items: cached, savedAt: Date.now() };
        return cached;
      }
      throw error;
    }
    if (!response || response.success !== true || !Array.isArray(response.data)) {
      throw new Error('استجابة الأقسام من الخادم غير متوقعة.');
    }

    const categories = response.data
      .filter((category) => Boolean(
        category && typeof category.id === 'string' &&
        typeof category.name === 'string' && typeof category.nameAr === 'string' &&
        typeof category.slug === 'string',
      ))
      .map((category) => ({
        ...category,
        children: Array.isArray(category.children)
          ? category.children.filter((child) => Boolean(
            child && typeof child.id === 'string' && typeof child.nameAr === 'string' &&
            typeof child.name === 'string' && typeof child.slug === 'string',
          ))
          : [],
      }));
    memoryCache = { items: categories, savedAt: Date.now() };
    await writePublicCache('categories', categories);
    return categories;
  })();
  inFlight = request;
  try {
    return await request;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}

/** Flatten only the two levels guaranteed by the backend category model. */
export function flattenPublicCategories(categories: PublicCategory[]): PublicCategory[] {
  return categories.flatMap((category) => [
    { ...category, children: [] },
    ...(category.children ?? []).map((child) => ({ ...child, children: [] })),
  ]);
}
