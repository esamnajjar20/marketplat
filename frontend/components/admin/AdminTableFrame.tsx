import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared shell for every admin data table: horizontal-scroll wrapper, base
 * <table> classes and the sticky "actions" last column (header cell uses the
 * same surface as <thead>, so the pinned cell never shows a different shade).
 *
 * Usage:
 *   <AdminTableFrame>
 *     <thead className={ADMIN_THEAD_CLASS}>…</thead>
 *     <tbody className="divide-y">…</tbody>
 *   </AdminTableFrame>
 *
 * Static class strings on purpose — Tailwind's scanner must see them verbatim.
 */
export const ADMIN_THEAD_CLASS =
  'bg-[var(--legacy-surface)] text-xs font-bold text-[var(--legacy-foreground-warm)]';

const STICKY_BASE =
  '[&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-[var(--legacy-surface)] [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]';
const STICKY_BG = {
  background: '[&_td:last-child]:bg-background',
  card: '[&_td:last-child]:bg-card',
} as const;

interface Props {
  children: ReactNode;
  /** Tailwind min-width class for the table, e.g. 'min-w-[760px]'. */
  minWidthClass?: string;
  /** Hide on <md (when the page renders a separate mobile card list). Default true. */
  hiddenOnMobile?: boolean;
  /** Pin the last column (row actions) while scrolling horizontally. Default true. */
  stickyActions?: boolean;
  /** Surface the pinned action cells paint over. Match the row background. */
  cellSurface?: keyof typeof STICKY_BG;
}

export function AdminTableFrame({
  children,
  minWidthClass = 'min-w-[640px]',
  hiddenOnMobile = true,
  stickyActions = true,
  cellSurface = 'background',
}: Props) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto overscroll-x-contain rounded-lg border',
        hiddenOnMobile && 'hidden md:block',
      )}
    >
      <table
        className={cn(
          'w-full text-sm',
          minWidthClass,
          stickyActions && STICKY_BASE,
          stickyActions && STICKY_BG[cellSurface],
        )}
      >
        {children}
      </table>
    </div>
  );
}
