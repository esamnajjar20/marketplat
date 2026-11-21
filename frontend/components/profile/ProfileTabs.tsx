'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  ENTITY_TABLIST,
  ENTITY_TAB_BTN,
  ENTITY_TAB_ACTIVE,
  ENTITY_TAB_IDLE,
} from '@/components/shared/entity-page/entityPageTokens';

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
 * UNIFIED-PROFILE + ENTITY-PAGE-RESTRUCTURE:
 * Same sticky tablist tokens as StoreStorefront so profile and store
 * feel like one product system on mobile and desktop.
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
      className={cn(ENTITY_TABLIST, className)}
    >
      {available.map((tab, index) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          ref={(el) => {
            refs.current[index] = el;
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => onChange(tab.value)}
          className={cn(
            ENTITY_TAB_BTN,
            value === tab.value ? ENTITY_TAB_ACTIVE : ENTITY_TAB_IDLE,
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
