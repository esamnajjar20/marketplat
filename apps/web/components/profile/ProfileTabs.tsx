'use client';

import { useRef, type KeyboardEvent } from 'react';
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
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowLeft') next = index + 1;
    else if (event.key === 'ArrowRight') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = available.length - 1;
    else return;
    event.preventDefault();
    const bounded = (next + available.length) % available.length;
    const nextTab = available[bounded];
    if (!nextTab) return;
    onChange(nextTab.value);
    refs.current[bounded]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="أقسام الملف الشخصي"
      className={cn('flex gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border px-1 scrollbar-thin', className)}
    >
      {available.map((tab, index) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          ref={(el) => { refs.current[index] = el; }}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => onChange(tab.value)}
          className={cn(
            'h-12 shrink-0 whitespace-nowrap border-b-[3px] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            value === tab.value
              ? 'border-primary font-extrabold text-primary-strong'
              : 'border-transparent font-semibold text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
