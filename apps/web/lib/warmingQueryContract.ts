/**
 * Canonical warming/query contract.
 *
 * W6: background warming must use the same URL shapes and query keys as the
 * React Query hooks. Keeping these definitions together prevents a warmed
 * response from being stored under a URL/key that the UI never reads.
 */
import { API_BASE_URL } from './constants';
import { queryKeys } from './queryKeys';

export type WarmingQueryContract = Readonly<{
  id: string;
  path: string;
  /** Exact TanStack Query key when a UI query consumes this warmed request. */
  queryKey?: readonly unknown[];
  /** 'react-query' means the path/key pair is a direct UI cache contract.
   * 'cache-only' means the response is intentionally stored only in Cache Storage. */
  consumer: 'react-query' | 'cache-only';
  scope: 'public' | 'user';
}>;

const publicEntries: ReadonlyArray<Omit<WarmingQueryContract, 'scope'>> = [
  // These two shapes are consumed directly by the home UI and therefore keep
  // an exact React Query key + wire URL contract.
  {
    id: 'products-home',
    path: '/products?limit=8&sortBy=createdAt&sortOrder=desc',
    queryKey: queryKeys.products.list({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' }),
    consumer: 'react-query',
  },
  {
    id: 'stores-home',
    path: '/stores?limit=6&sortBy=createdAt&sortOrder=desc',
    queryKey: queryKeys.stores.list({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }),
    consumer: 'react-query',
  },
  // The remaining core requests are deliberately cache-only. They are not
  // pretending to hydrate a React Query entry whose exact params are not used
  // by a stable UI caller; this avoids false cache-key equivalence.
  {
    id: 'products-default',
    path: '/products?page=1&sortBy=createdAt&sortOrder=desc&limit=12',
    consumer: 'cache-only',
  },
  {
    id: 'stores-default',
    path: '/stores?page=1&sortBy=createdAt&sortOrder=desc',
    consumer: 'cache-only',
  },
  {
    id: 'ads-default',
    path: '/ads?page=1&sortBy=createdAt&sortOrder=desc',
    consumer: 'cache-only',
  },
  {
    id: 'services-default',
    path: '/service-listings?page=1&sortBy=createdAt&sortOrder=desc',
    consumer: 'cache-only',
  },
  {
    id: 'ads-featured',
    path: '/ads?isFeatured=true&limit=4',
    consumer: 'cache-only',
  },
] as const;

export const PUBLIC_WARMING_QUERIES: readonly WarmingQueryContract[] =
  publicEntries.map((entry) => ({ ...entry, scope: 'public' as const }));

export const USER_WARMING_QUERIES: readonly WarmingQueryContract[] = [
  { id: 'me', path: '/users/me', queryKey: queryKeys.auth.me(), consumer: 'react-query', scope: 'user' },
  { id: 'conversations', path: '/conversations?limit=20', queryKey: queryKeys.conversations.mine({ limit: 20 }), consumer: 'react-query', scope: 'user' },
  { id: 'notifications', path: '/notifications?limit=20', queryKey: queryKeys.notifications.mine({ limit: 20 }), consumer: 'react-query', scope: 'user' },
  { id: 'my-ads', path: '/ads/me?page=1&limit=20', queryKey: queryKeys.ads.mine({ page: 1, limit: 20 }), consumer: 'react-query', scope: 'user' },
  // Cache-only private snapshots for the other first-party hubs. These use
  // exact API URL shapes and a medium freshness window to avoid turning every
  // warm tick into a burst of personal-data requests.
  { id: 'my-products', path: '/products/me?page=1&limit=10', consumer: 'cache-only', scope: 'user' },
  { id: 'my-services', path: '/service-listings/me?page=1&limit=10', consumer: 'cache-only', scope: 'user' },
  { id: 'my-requests', path: '/requests/me?page=1&limit=20', consumer: 'cache-only', scope: 'user' },
  { id: 'my-request-offers', path: '/requests/offers/me?page=1&limit=20', consumer: 'cache-only', scope: 'user' },
  { id: 'service-requests-customer', path: '/service-requests/me?page=1&limit=10', consumer: 'cache-only', scope: 'user' },
  { id: 'service-requests-incoming', path: '/service-requests/incoming?page=1&limit=10', consumer: 'cache-only', scope: 'user' },
  { id: 'sales-list', path: '/sales?page=1&limit=12', consumer: 'cache-only', scope: 'user' },
  { id: 'sales-summary-month', path: '/sales/summary?period=month', consumer: 'cache-only', scope: 'user' },
  { id: 'sales-debt-summary', path: '/sales/debts/summary', consumer: 'cache-only', scope: 'user' },
  { id: 'sales-installments-upcoming', path: '/sales/installments/upcoming', consumer: 'cache-only', scope: 'user' },
  { id: 'sales-installments-overdue', path: '/sales/installments/overdue', consumer: 'cache-only', scope: 'user' },
  { id: 'sales-cost-settings', path: '/sales/cost-settings', consumer: 'cache-only', scope: 'user' },
  { id: 'sales-cost-products', path: '/sales/cost-products', consumer: 'cache-only', scope: 'user' },
  { id: 'favorites', path: '/favorites?page=1&limit=20', queryKey: queryKeys.favorites.all({ page: 1, limit: 20 }), consumer: 'react-query', scope: 'user' },
  { id: 'my-ad-stats', path: '/ads/me/stats', queryKey: queryKeys.ads.myStats(), consumer: 'react-query', scope: 'user' },
  { id: 'seller-attention', path: '/sellers/me/attention', queryKey: queryKeys.sellers.attention(), consumer: 'react-query', scope: 'user' },
  { id: 'activity', path: '/activity?limit=8', queryKey: queryKeys.activity.mine({ limit: 8 }), consumer: 'react-query', scope: 'user' },
];


export function warmingQueryUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function getWarmingQueryByPath(path: string): WarmingQueryContract | undefined {
  return [...PUBLIC_WARMING_QUERIES, ...USER_WARMING_QUERIES].find((entry) => entry.path === path);
}
