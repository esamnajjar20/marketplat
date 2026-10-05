'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'marketplat:navigation-usage:v1';
const MAX_ITEMS = 80;
const RECENT_LIMIT = 8;
const RECENCY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;

type UsageEntry = { count: number; lastUsed: number };
type UsageMap = Record<string, UsageEntry>;

function readUsage(): UsageMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UsageMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeUsage(usage: UsageMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Navigation must never fail because localStorage is unavailable.
  }
}

export function useNavigationUsage() {
  const [usage, setUsage] = useState<UsageMap>({});

  useEffect(() => {
    setUsage(readUsage());
  }, []);

  const recordNavigation = useCallback((href: string) => {
    if (!href || href.startsWith('#')) return;

    setUsage((current) => {
      const next: UsageMap = {
        ...current,
        [href]: {
          count: (current[href]?.count ?? 0) + 1,
          lastUsed: Date.now(),
        },
      };

      const keys = Object.keys(next);
      if (keys.length > MAX_ITEMS) {
        keys
          .sort((a, b) => (next[b]?.lastUsed ?? 0) - (next[a]?.lastUsed ?? 0))
          .slice(MAX_ITEMS)
          .forEach((key) => delete next[key]);
      }

      writeUsage(next);
      return next;
    });
  }, []);

  const recentHrefs = useMemo(
    () =>
      Object.entries(usage)
        .sort(([, a], [, b]) => b.lastUsed - a.lastUsed)
        .slice(0, RECENT_LIMIT)
        .map(([href]) => href),
    [usage],
  );

  const isUsed = useCallback((href: string) => Boolean(usage[href]), [usage]);
  const getCount = useCallback((href: string) => usage[href]?.count ?? 0, [usage]);

  const getSmartScore = useCallback((href: string, importance = 0) => {
    const entry = usage[href];
    if (!entry) return importance;

    const age = Math.max(0, Date.now() - entry.lastUsed);
    const recency = Math.max(0, 1 - age / RECENCY_WINDOW_MS);
    const frequency = Math.min(entry.count, 12) / 12;

    // Importance remains the dominant signal. Usage personalizes the order
    // without allowing a frequently opened low-priority page to outrank a
    // role-critical destination.
    return importance + recency * 28 + frequency * 18;
  }, [usage]);

  const sortSmart = useCallback(<T extends { href: string }>(
    items: readonly T[],
    importance: Record<string, number> = {},
  ) => {
    return [...items].sort((a, b) => {
      const scoreDiff = getSmartScore(b.href, importance[b.href] ?? 0) - getSmartScore(a.href, importance[a.href] ?? 0);
      if (Math.abs(scoreDiff) > 0.5) return scoreDiff;
      return a.href.localeCompare(b.href);
    });
  }, [getSmartScore]);

  return { recordNavigation, recentHrefs, isUsed, getCount, getSmartScore, sortSmart };
}
