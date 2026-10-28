'use client';

import { formatRelativeTime } from '@/lib/formatters';
import { useNowAfterMount } from '@/components/shared/cards/cardParts';

/** Keeps relative-time text identical during SSR and the first hydration render. */
export function HydrationSafeRelativeTime({ date }: { date: string | Date | null | undefined }) {
  const dateStr = date instanceof Date
    ? (Number.isNaN(date.getTime()) ? '' : date.toISOString())
    : date ? String(date) : '';
  const now = useNowAfterMount(true, dateStr);
  if (!dateStr || now === null) return <>—</>;
  return <>{formatRelativeTime(dateStr, now)}</>;
}
