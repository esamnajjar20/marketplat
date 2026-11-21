'use client';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';
import { BROWSE_LINKS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

const EXPLORE_LINKS = BROWSE_LINKS.filter((l) => l.href !== ROUTES.home).map((l) =>
  l.href === ROUTES.search ? { ...l, label: 'بحث شامل' } : l,
);

// Put home first in the grid as in the design
const GRID_LINKS = [
  { label: 'الرئيسية', href: ROUTES.home, icon: BROWSE_LINKS.find((l) => l.href === ROUTES.home)?.icon },
  ...EXPLORE_LINKS,
].filter((l) => l.icon);

/**
 * UX-IMPROVEMENT Phase 4 (2026-11-21):
 * - "بحث شامل" is now a full-width primary action at the top of the sheet
 *   so discovery of search is one less mental step.
 * - Remaining browse links stay in a clean 2-col grid.
 */
export function ExploreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const searchLink = GRID_LINKS.find((l) => l.href === ROUTES.search);
  const otherLinks = GRID_LINKS.filter((l) => l.href !== ROUTES.search);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 rounded-t-[20px] border-border p-0">
        <SheetHeader className="space-y-1 px-4 pb-3 pt-2 text-start">
          <SheetTitle className="text-[17px] font-extrabold">استكشاف</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            تصفّح أقسام المنصة أو ابحث مباشرة
          </SheetDescription>
        </SheetHeader>

        <div className="px-3 pb-2">
          {searchLink && (
            <IntentPrefetchLink
              href={searchLink.href}
              prefetch={false}
              onClick={() => onOpenChange(false)}
              className={cn(
                'mb-3 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary-soft/60 px-4 py-3',
                'text-sm font-extrabold text-primary transition-colors hover:bg-primary-soft hover:border-primary/40',
                'active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <span>بحث شامل</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
                <Search className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
              </span>
            </IntentPrefetchLink>
          )}
        </div>

        <nav
          aria-label="استكشاف المنصة"
          className="grid grid-cols-2 gap-2 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          {otherLinks.map(({ label, href, icon: Icon }) => {
            if (!Icon) return null;
            return (
              <IntentPrefetchLink
                key={href}
                href={href}
                prefetch={false}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-3',
                  'text-sm font-bold text-foreground transition-colors hover:border-primary/30 hover:bg-primary-soft/50',
                  'active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span>{label}</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
                </span>
              </IntentPrefetchLink>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
