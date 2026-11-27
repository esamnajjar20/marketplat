'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  clearFilterParams,
  countConfiguredFilters,
  updateFilterParams,
  getFilterProfile,
  type ActiveFilterConfig,
  type FilterProfile,
  type FilterPatch,
  type UpdateFilterOptions,
} from '../../shared/filters';
import { buildUrlWithParams, writeClientUrl } from '@/lib/urlWithParams';

type NavigationMode = 'push' | 'replace';

export interface UnifiedFilterOptions {
  /** URL path receiving the filters; defaults to the current pathname. */
  basePath?: string;
  /** Canonical filter contract for this listing surface. */
  profile?: FilterProfile;
  /** Custom count contract for exceptional/dynamic filter surfaces. */
  count?: ActiveFilterConfig;
  /** URL history operation; defaults to push. */
  mode?: NavigationMode;
}

export interface UnifiedFilterUpdateOptions extends UpdateFilterOptions {
  mode?: NavigationMode;
}

/**
 * Shared App Router adapter for the framework-independent filter core.
 * All list pages use this hook instead of maintaining local URL mutation logic.
 */
export function useUnifiedFilters(options: UnifiedFilterOptions = {}) {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const basePath = options.basePath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const mode = options.mode ?? 'push';

  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);
  const profileConfig = options.profile ? getFilterProfile(options.profile) : undefined;
  const countConfig = options.count ?? profileConfig;
  const activeCount = useMemo(
    () => countConfig ? countConfiguredFilters(params, countConfig) : 0,
    [params, countConfig],
  );

  const commit = useCallback((next: URLSearchParams, nextMode: NavigationMode = mode) => {
    writeClientUrl(buildUrlWithParams(basePath, next), nextMode);
  }, [basePath, mode]);

  const updateMany = useCallback((patch: FilterPatch, updateOptions: UnifiedFilterUpdateOptions = {}) => {
    // Read the live address bar when available to avoid losing two quick updates
    // issued before Next has published the preceding useSearchParams snapshot.
    const current = typeof window === 'undefined'
      ? queryString
      : window.location.search;
    const allowedKeys = profileConfig
      ? [...new Set([
        ...profileConfig.keys,
        ...(profileConfig.params ?? []),
        ...(profileConfig.contextKeys ?? []),
        'page',
        'limit',
      ])]
      : undefined;
    const next = updateFilterParams(current, patch, { ...updateOptions, allowedKeys });
    commit(next, updateOptions.mode ?? mode);
    return next;
  }, [commit, mode, profileConfig, queryString]);

  const update = useCallback((key: string, value: FilterPatch[string], updateOptions?: UnifiedFilterUpdateOptions) =>
    updateMany({ [key]: value }, updateOptions), [updateMany]);

  const remove = useCallback((keys: readonly string[], updateOptions: UnifiedFilterUpdateOptions = {}) => {
    const patch: Record<string, null> = {};
    for (const key of keys) patch[key] = null;
    return updateMany(patch, updateOptions);
  }, [updateMany]);

  const updateDebounced = useCallback((
    key: string,
    value: FilterPatch[string],
    delayMs = 400,
    updateOptions: UnifiedFilterUpdateOptions = {},
  ) => {
    const previous = timers.current.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      timers.current.delete(key);
      update(key, value, updateOptions);
    }, Math.max(0, delayMs));
    timers.current.set(key, timer);
  }, [update]);

  const cancelPending = useCallback((key?: string) => {
    if (key) {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.delete(key);
      return;
    }
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  const clear = useCallback((preserveKeys: readonly string[] = [], nextMode: NavigationMode = mode) => {
    const current = typeof window === 'undefined' ? queryString : window.location.search;
    const next = clearFilterParams(current, preserveKeys);
    commit(next, nextMode);
    return next;
  }, [commit, mode, queryString]);

  return {
    params,
    get: (key: string) => params.get(key),
    has: (key: string) => params.has(key),
    activeCount,
    hasActiveFilters: activeCount > 0,
    update,
    updateMany,
    updateDebounced,
    cancelPending,
    remove,
    clear,
    commit,
  };
}
