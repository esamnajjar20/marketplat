'use client';

import { List, Map as MapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SearchViewMode = 'list' | 'map';

interface Props {
  value: SearchViewMode;
  onChange: (mode: SearchViewMode) => void;
  className?: string;
}

export function SearchViewToggle({ value, onChange, className }: Props) {
  return (
    <div
      className={cn(
        'inline-flex rounded-lg border bg-background p-0.5 text-sm',
        className
      )}
      role="group"
      aria-label="طريقة العرض"
    >
      {/* SW-VIEWTOGGLE-ARIA-01: aria-pressed was missing on both
          buttons. Inside role="group" they are toggle buttons; without
          aria-pressed a screen reader hears "قائمة, button" with no
          way to know which mode is active. */}
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
          value === 'list'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <List className="h-3.5 w-3.5" aria-hidden />
        قائمة
      </button>
      <button
        type="button"
        onClick={() => onChange('map')}
        aria-pressed={value === 'map'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
          value === 'map'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <MapIcon className="h-3.5 w-3.5" aria-hidden />
        خريطة
      </button>
    </div>
  );
}
