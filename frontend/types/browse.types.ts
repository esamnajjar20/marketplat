import type { PaginationMeta } from '@/types/api.types';

/** Serializable first-page payload shared by Server and Client Components. */
export interface BrowsePage<T> {
  items: T[];
  meta: PaginationMeta;
}
