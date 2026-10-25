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

/** Read saved categories immediately for local-first rendering. */
export async function getCachedPublicCategories(): Promise<PublicCategory[] | null> {
  const cached = await readPublicCache<PublicCategory[]>('categories');
  return Array.isArray(cached) ? cached : null;
}

/** Uses the existing public GET /api/v1/categories tree. */
export async function fetchPublicCategories(): Promise<PublicCategory[]> {
  let response: ApiEnvelope<PublicCategory[]>;
  try {
    response = await apiRequest<ApiEnvelope<PublicCategory[]>>('/api/v1/categories');
  } catch (error) {
    const cached = await readPublicCache<PublicCategory[]>('categories');
    if (cached && Array.isArray(cached)) return cached;
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
  await writePublicCache('categories', categories);
  return categories;
}

/** Flatten only the two levels guaranteed by the backend category model. */
export function flattenPublicCategories(categories: PublicCategory[]): PublicCategory[] {
  return categories.flatMap((category) => [
    { ...category, children: [] },
    ...(category.children ?? []).map((child) => ({ ...child, children: [] })),
  ]);
}
