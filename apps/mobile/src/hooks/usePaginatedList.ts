import { useCallback, useEffect, useRef, useState } from 'react';
import { resolvePageState, mergeUniquePageItems, type PageMetaLike } from '@/lib/pagination';

export type PaginatedResponse<T> = {
  items: T[];
  meta?: PageMetaLike;
};

export type PaginatedListState<T> = {
  items: T[];
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  refresh: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
  updateItems: (updater: (current: T[]) => T[]) => void;
};

type Options<T> = {
  /** Changes whenever the account, entity, or filters that own this list change. */
  key: string;
  pageSize: number;
  enabled?: boolean;
  fetchPage: (page: number, signal: AbortSignal) => Promise<PaginatedResponse<T>>;
  /** Optional local snapshot read before the network refresh; never used for append pages. */
  readCachedPage?: (page: number) => Promise<PaginatedResponse<T> | null>;
  getItemKey: (item: T) => string;
  mapError?: (error: unknown) => string;
};

function defaultMapError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'تعذر تحميل القائمة. حاول مجددًا.';
}

/**
 * Shared numbered-pagination lifecycle for mobile lists.
 * - cancels old requests when the list identity changes or refresh starts;
 * - ignores stale responses even when an API implementation cannot abort;
 * - de-duplicates rows across pages;
 * - keeps existing rows visible after refresh/page-append failures;
 * - exposes a distinct load-more error so retrying page N never silently resets to page 1.
 */
export function usePaginatedList<T>(options: Options<T>): PaginatedListState<T> {
  const {
    key,
    pageSize,
    enabled = true,
    fetchPage,
    readCachedPage,
    getItemKey,
    mapError = defaultMapError,
  } = options;

  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [stateKey, setStateKey] = useState(key);

  const fetchPageRef = useRef(fetchPage);
  const readCachedPageRef = useRef(readCachedPage);
  const getItemKeyRef = useRef(getItemKey);
  const mapErrorRef = useRef(mapError);
  fetchPageRef.current = fetchPage;
  readCachedPageRef.current = readCachedPage;
  getItemKeyRef.current = getItemKey;
  mapErrorRef.current = mapError;

  const itemsRef = useRef<T[]>([]);
  const pageRef = useRef(1);
  const hasNextPageRef = useRef(false);
  const generationRef = useRef(0);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const moreControllerRef = useRef<AbortController | null>(null);
  const moreInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const lastFailedRequestRef = useRef<{ kind: 'refresh' | 'page' | 'more'; page: number } | null>(null);

  const updateItems = useCallback((updater: (current: T[]) => T[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    const generation = ++generationRef.current;
    lastFailedRequestRef.current = null;
    setStateKey(key);
    refreshInFlightRef.current = true;
    refreshControllerRef.current?.abort();
    moreControllerRef.current?.abort();
    moreInFlightRef.current = false;

    const controller = new AbortController();
    refreshControllerRef.current = controller;
    const hadItems = itemsRef.current.length > 0;
    setLoading(!hadItems);
    setRefreshing(hadItems);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);

    try {
      // Hydrate page 1 from a local snapshot before the network request. Cached
      // rows remain provisional: the live response always replaces them, while
      // a transport failure leaves the snapshot visible with an error state.
      if (!hadItems && readCachedPageRef.current) {
        try {
          const cached = await readCachedPageRef.current(1);
          if (cached && generation === generationRef.current && !controller.signal.aborted) {
            const cachedPage = resolvePageState(cached.meta, 1, cached.items.length, pageSize);
            const cachedItems = mergeUniquePageItems([], cached.items, getItemKeyRef.current);
            itemsRef.current = cachedItems;
            pageRef.current = cachedPage.page;
            hasNextPageRef.current = cachedPage.hasNextPage;
            setItems(cachedItems);
            setPage(cachedPage.page);
            setTotalPages(cachedPage.totalPages);
            setHasNextPage(cachedPage.hasNextPage);
            setLoading(false);
            setRefreshing(true);
          }
        } catch {
          // A local-cache failure must not block the authoritative network read.
        }
      }
      if (generation !== generationRef.current || controller.signal.aborted) return;
      const result = await fetchPageRef.current(1, controller.signal);
      if (generation !== generationRef.current || controller.signal.aborted) return;
      const next = resolvePageState(result.meta, 1, result.items.length, pageSize);
      const nextItems = mergeUniquePageItems([], result.items, getItemKeyRef.current);
      itemsRef.current = nextItems;
      pageRef.current = next.page;
      hasNextPageRef.current = next.hasNextPage;
      lastFailedRequestRef.current = null;
      setItems(nextItems);
      setPage(next.page);
      setTotalPages(next.totalPages);
      setHasNextPage(next.hasNextPage);
    } catch (requestError) {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      lastFailedRequestRef.current = { kind: 'refresh', page: 1 };
      setError(mapErrorRef.current(requestError));
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        refreshInFlightRef.current = false;
        if (refreshControllerRef.current === controller) refreshControllerRef.current = null;
      }
    }
  }, [enabled, key, pageSize]);

  const goToPage = useCallback(async (targetPage: number) => {
    if (!enabled || !Number.isFinite(targetPage)) return;
    const requestedPage = Math.max(1, Math.floor(targetPage));
    if (requestedPage === pageRef.current && itemsRef.current.length > 0) return;

    const generation = ++generationRef.current;
    lastFailedRequestRef.current = null;
    refreshInFlightRef.current = true;
    refreshControllerRef.current?.abort();
    moreControllerRef.current?.abort();
    moreInFlightRef.current = false;

    const controller = new AbortController();
    refreshControllerRef.current = controller;
    setStateKey(key);
    setLoading(true);
    setRefreshing(false);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);

    try {
      const result = await fetchPageRef.current(requestedPage, controller.signal);
      if (generation !== generationRef.current || controller.signal.aborted) return;
      const next = resolvePageState(result.meta, requestedPage, result.items.length, pageSize);
      lastFailedRequestRef.current = null;
      const nextItems = mergeUniquePageItems([], result.items, getItemKeyRef.current);
      itemsRef.current = nextItems;
      pageRef.current = next.page;
      hasNextPageRef.current = next.hasNextPage;
      setItems(nextItems);
      setPage(next.page);
      setTotalPages(next.totalPages);
      setHasNextPage(next.hasNextPage);
    } catch (requestError) {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      lastFailedRequestRef.current = { kind: 'page', page: requestedPage };
      setError(mapErrorRef.current(requestError));
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        refreshInFlightRef.current = false;
        if (refreshControllerRef.current === controller) refreshControllerRef.current = null;
      }
    }
  }, [enabled, key, pageSize]);

  const loadMore = useCallback(async () => {
    if (!enabled || refreshInFlightRef.current || !hasNextPageRef.current || moreInFlightRef.current) return;

    const generation = generationRef.current;
    const requestedPage = pageRef.current + 1;
    lastFailedRequestRef.current = null;
    const controller = new AbortController();
    moreControllerRef.current?.abort();
    moreControllerRef.current = controller;
    moreInFlightRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const result = await fetchPageRef.current(requestedPage, controller.signal);
      if (generation !== generationRef.current || controller.signal.aborted) return;
      const next = resolvePageState(result.meta, requestedPage, result.items.length, pageSize);
      lastFailedRequestRef.current = null;
      const merged = mergeUniquePageItems(itemsRef.current, result.items, getItemKeyRef.current);
      itemsRef.current = merged;
      pageRef.current = next.page;
      hasNextPageRef.current = next.hasNextPage;
      setItems(merged);
      setPage(next.page);
      setTotalPages(next.totalPages);
      setHasNextPage(next.hasNextPage);
    } catch (requestError) {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      lastFailedRequestRef.current = { kind: 'more', page: requestedPage };
      setLoadMoreError(mapErrorRef.current(requestError));
    } finally {
      if (generation === generationRef.current && moreControllerRef.current === controller) {
        moreInFlightRef.current = false;
        moreControllerRef.current = null;
        setLoadingMore(false);
      }
    }
  }, [enabled, pageSize]);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      refreshControllerRef.current?.abort();
      moreControllerRef.current?.abort();
      moreInFlightRef.current = false;
      refreshInFlightRef.current = false;
      setStateKey(key);
      itemsRef.current = [];
      pageRef.current = 1;
      hasNextPageRef.current = false;
      setItems([]);
      setPage(1);
      setTotalPages(1);
      setHasNextPage(false);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
      lastFailedRequestRef.current = null;
      return undefined;
    }

    // Do not show data from the previous user, entity, or filter while the new list loads.
    itemsRef.current = [];
    pageRef.current = 1;
    hasNextPageRef.current = false;
    setItems([]);
    setPage(1);
    setTotalPages(1);
    setHasNextPage(false);
    void refresh();

    return () => {
      generationRef.current += 1;
      refreshInFlightRef.current = false;
      refreshControllerRef.current?.abort();
      moreControllerRef.current?.abort();
      moreInFlightRef.current = false;
    };
  }, [key, enabled, refresh]);

  const retry = useCallback(async () => {
    const failed = lastFailedRequestRef.current;
    if (!failed || failed.kind === 'refresh') return refresh();
    if (failed.kind === 'page') return goToPage(failed.page);
    return loadMore();
  }, [refresh, goToPage, loadMore]);

  const isCurrentKey = stateKey === key;

  return {
    // Hide prior-key rows synchronously during the render before the new effect runs.
    items: isCurrentKey ? items : [],
    page: isCurrentKey ? page : 1,
    totalPages: isCurrentKey ? totalPages : 1,
    hasNextPage: isCurrentKey ? hasNextPage : false,
    loading: isCurrentKey ? loading : enabled,
    refreshing: isCurrentKey ? refreshing : false,
    loadingMore: isCurrentKey ? loadingMore : false,
    error: isCurrentKey ? error : null,
    loadMoreError: isCurrentKey ? loadMoreError : null,
    refresh,
    goToPage,
    loadMore,
    retry,
    updateItems,
  };
}
