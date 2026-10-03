'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { cn } from '@/lib/utils';

/**
 * Shared shell for homepage type rails.
 * UI-HOME-02: `variant` gives each rail a light visual identity so stacked
 * horizontal strips do not feel identical while scrolling on mobile.
 */
export interface HomeRailShellProps {
  header: ReactNode;
  status: 'loading' | 'error' | 'empty' | 'ready';
  skeleton: ReactNode;
  skeletonCount: number;
  error?: unknown;
  onRetry?: () => void;
  empty: {
    icon: ReactNode;
    title: string;
    description: string;
    action?: ReactNode;
  };
  children?: ReactNode;
  /** Surface treatment for the section. */
  variant?: 'default' | 'soft' | 'accent' | 'nearby';
  className?: string;
}

const VARIANT_SURFACE: Record<NonNullable<HomeRailShellProps['variant']>, string> = {
  default: '',
  soft: 'rounded-2xl bg-muted/30 py-3 sm:py-4',
  accent: 'rounded-2xl border border-accent/20 bg-accent/[0.04] py-3 sm:py-4',
  nearby: 'rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] py-3 sm:py-4',
};

export function HomeRailShell({
  header,
  status,
  skeleton,
  skeletonCount,
  error,
  onRetry,
  empty,
  children,
  variant = 'default',
  className,
}: HomeRailShellProps) {
  const sectionClass = cn(
    'container mx-auto max-w-7xl space-y-3 px-3 py-2 sm:space-y-4 sm:px-4 sm:py-3',
    VARIANT_SURFACE[variant],
    'section-enter',
    className,
  );

  if (status === 'loading') {
    return (
      <section className={sectionClass}>
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
      <section className={sectionClass}>
        {header}
        <ApiError error={error} onRetry={onRetry} variant="inline" />
      </section>
    );
  }

  if (status === 'empty') {
    return (
      <section className={sectionClass}>
        {header}
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          action={empty.action}
          compact
        />
      </section>
    );
  }

  return (
    <section className={sectionClass}>
      {header}
      <HomeScrollRail className="stagger-fade-in">{children}</HomeScrollRail>
    </section>
  );
}
