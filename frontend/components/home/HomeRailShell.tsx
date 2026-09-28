'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';

/**
 * Shared shell for the homepage type rails (services, stores, ...).
 *
 * Owns the parts every rail repeated by hand: the section wrapper, the
 * loading skeleton rail, the inline error state and the empty state. A rail
 * only supplies its header, its skeleton and its cards.
 */
export interface HomeRailShellProps {
  header: ReactNode;
  status: 'loading' | 'error' | 'empty' | 'ready';
  /** Skeleton card, repeated `skeletonCount` times while loading. */
  skeleton: ReactNode;
  skeletonCount: number;
  error?: unknown;
  onRetry?: () => void;
  empty: { icon: ReactNode; title: string; description: string };
  /** Cards, each already wrapped in <HomeScrollRailItem>. */
  children?: ReactNode;
}

const SECTION = 'container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3';

export function HomeRailShell({
  header,
  status,
  skeleton,
  skeletonCount,
  error,
  onRetry,
  empty,
  children,
}: HomeRailShellProps) {
  if (status === 'loading') {
    return (
      <section className={`${SECTION} section-enter`}>
        {header}
        <HomeScrollRail>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <HomeScrollRailItem key={i}>{skeleton}</HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className={SECTION}>
        {header}
        <ApiError error={error} onRetry={onRetry} variant="inline" />
      </section>
    );
  }

  if (status === 'empty') {
    return (
      <section className={`${SECTION} section-enter`}>
        {header}
        <EmptyState icon={empty.icon} title={empty.title} description={empty.description} compact />
      </section>
    );
  }

  return (
    <section className={`${SECTION} section-enter`}>
      {header}
      <HomeScrollRail className="stagger-fade-in">{children}</HomeScrollRail>
    </section>
  );
}
