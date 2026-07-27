/**
 * FIX API-SHAPE-01: the backend's successResponse() (api-response.types.ts)
 * puts a paginated list's items directly on the top-level `data` field —
 * NOT `data.items` — and puts pagination info under the top-level `meta`
 * field as `meta.pagination`, NOT `data.meta`:
 *
 *   res.json(successResponse('Ads fetched', result.items, { pagination: result.meta }))
 *   →  { success, message, data: AdListItem[], meta: { pagination: PaginationMeta } }
 *
 * Every api/*.ts list endpoint (ads.getAll/searchAds/getMyAds,
 * admin.getAds/getUsers/getReports, favorites.getAll, users.getUserAds)
 * used to type its response as `ApiResponse<{ items: T[]; meta: object }>`,
 * assuming `data` itself was `{ items, meta }`. That shape never existed
 * on the wire — every query hook's `.then(r => r.data.data)` was
 * therefore handing components either a bare array (with an
 * ever-undefined `.meta`) or, before the `meta: object` type was fixed,
 * a TypeScript error masking that same bare-array reality. Every
 * `data.items` / `data.meta.totalPages` read across the app
 * (SearchResults, AdminUsersTable, MyAdsList, FavoritesList, etc.) was
 * reading through a shape that was never actually there.
 *
 * unwrapPaginated re-assembles the axios response's `.data` into the
 * `{ items, meta }` shape every query hook already expects, so no hook
 * or component needs to change — only the api/*.ts call sites that
 * fetch a paginated list.
 */
import type { AxiosResponse } from 'axios';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';

const EMPTY_PAGINATION: PaginationMeta = {
  total: 0, page: 1, limit: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false,
};

export function unwrapPaginated<T>(
  response: AxiosResponse<ApiResponse<T[]>>,
): AxiosResponse<ApiResponse<{ items: T[]; meta: PaginationMeta }>> {
  // The backend always builds a full PaginationMeta via buildPaginationMeta()
  // for every real successful list response — meta.pagination missing
  // entirely only happens on a malformed/error response. Falling back to
  // real zero-value defaults here (rather than an empty object cast to
  // PaginationMeta) means a caller reading e.g. `.totalPages` gets an
  // actual 0, not a silent runtime `undefined` wearing a PaginationMeta type.
  const pagination = (response.data.meta?.pagination as PaginationMeta | undefined) ?? EMPTY_PAGINATION;
  return {
    ...response,
    data: {
      ...response.data,
      data: {
        items: response.data.data ?? [],
        meta:  pagination,
      },
    },
  };
}

/**
 * Unwraps a single-object ApiResponse<T> and asserts `data` is present.
 *
 * `ApiResponse<T>.data` is typed `T | undefined` because the same shape
 * also covers error responses. On the success path of a 2xx response the
 * backend's successResponse() always includes `data` for these endpoints
 * (login, register, profile update, etc.) — this narrows that guarantee
 * for TypeScript instead of leaving every call site to write its own
 * non-null assertion or optional-chain around a value that, in practice,
 * is never actually missing here. Throws (rather than silently
 * proceeding with `undefined`) in the one real edge case where a caller
 * misuses this on a response that legitimately can lack `data`.
 */
export function unwrapData<T>(response: AxiosResponse<ApiResponse<T>>): T {
  if (response.data.data === undefined) {
    throw new Error(response.data.message || 'Unexpected empty response');
  }
  return response.data.data;
}
