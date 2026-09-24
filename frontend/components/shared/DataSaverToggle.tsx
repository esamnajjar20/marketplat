'use client';

import { WifiOff } from 'lucide-react';
import { useDataSaver } from '@/hooks/useDataSaver';
import { cn } from '@/lib/utils';

/**
 * Toggle for reduced image weight on slow networks.
 * Mounted on settings/profile and optionally near ThemeToggle.
 */
export function DataSaverToggle({ className }: { className?: string }) {
  const { enabled, setEnabled } = useDataSaver();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setEnabled(!enabled)}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-start transition-colors hover:bg-muted/50',
        className,
      )}
    >
      <span className="flex items-center gap-3">
        <WifiOff className="h-4 w-4 text-primary" aria-hidden />
        <span>
          <span className="block text-sm font-medium">توفير البيانات</span>
          <span className="block text-xs text-muted-foreground">
            صور أصغر بدون معاينة ضبابية — مناسب للشبكات الضعيفة
          </span>
        </span>
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          enabled ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all',
            // SW-FIX-DATASAVER-KNOB: `inset-inline-start-5` is not a valid
            // Tailwind 3.x class — the correct logical-property utility is
            // `start-5` (Tailwind maps `start-*` to inset-inline-start). The
            // previous strings matched no rule, so the knob sat at its
            // static-default (same) position in both states — the switch
            // looked broken: it toggled ARIA/filter behaviour correctly
            // but never moved visually. Verified against ScrollToTop's own
            // `start-4` (same utility family, works).
            enabled ? 'start-5' : 'start-0.5',
          )}
        />
      </span>
    </button>
  );
}
