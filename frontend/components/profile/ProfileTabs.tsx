'use client';

import { cn } from '@/lib/utils';

export type ProfileTabValue = 'overview' | 'ads' | 'store' | 'services' | 'ratings';

interface Props {
  value: ProfileTabValue;
  onChange: (value: ProfileTabValue) => void;
  /** Which tabs to render, in order — pages/sections the user doesn't
   * have (no store, no service profile, zero ads/ratings) are simply
   * left out of this list rather than rendered disabled. */
  available: { value: ProfileTabValue; label: string }[];
  className?: string;
}

/**
 * UNIFIED-PROFILE: same lightweight button-group pattern SearchTabs.tsx
 * already established (no shadcn Tabs primitive installed in this
 * project) — reused here rather than introducing a second tab
 * implementation. The tab list itself is driven entirely by the
 * `available` prop the page computes from what the profile actually
 * has, so a plain user only ever sees [نظرة عامة] [الإعلانات]
 * [التقييمات] while a seller with a store and services sees all five.
 */
export function ProfileTabs({ value, onChange, available, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="أقسام الملف الشخصي"
      className={cn('flex gap-1 overflow-x-auto rounded-full bg-muted p-1 shadow-sm', className)}
    >
      {available.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'shrink-0 flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all',
            value === tab.value
              ? 'bg-card text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
