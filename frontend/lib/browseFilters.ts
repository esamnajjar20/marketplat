/** Backwards-compatible frontend facade over the monorepo filter core. */
import {
  buildFilterHref,
  countConfiguredFilters,
  updateFilterParams,
  type FilterValue,
} from '../../shared/filters';

export type BrowseFilterValue = FilterValue;

/** Apply filter changes to the current query string and reset pagination. */
export function updateBrowseFilterParams(
  current: URLSearchParams | string,
  updates: Record<string, BrowseFilterValue>,
  clearKeys: readonly string[] = [],
): URLSearchParams {
  return updateFilterParams(current, updates, { clearKeys, resetPage: true });
}

/** Build a clean href without a trailing question mark for an empty query. */
export const buildBrowseFilterHref = buildFilterHref;

/** Count populated filter parameters; groups such as lat/lng count as one. */
export function countActiveFilterParams(
  params: URLSearchParams,
  keys: readonly string[],
  groups: readonly (readonly string[])[] = [],
  ignoredValues: Readonly<Record<string, readonly string[]>> = {},
): number {
  return countConfiguredFilters(params, { keys, groups, ignoredValues });
}
