'use client';

import Link from 'next/link';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';
import { BROWSE_LINKS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const EXPLORE_LINKS = BROWSE_LINKS.filter((l) => l.href !== ROUTES.home).map((l) =>
  l.href === ROUTES.search ? { ...l, label: 'بحث شامل' } : l,
);

// Put home first in the grid as in the design
const GRID_LINKS = [
  { label: 'الرئيسية', href: ROUTES.home, icon: BROWSE_LINKS.find((l) => l.href === ROUTES.home)?.icon },
  ...EXPLORE_LINKS,
].filter((l) => l.icon);

export function ExploreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 rounded-t-[20px] border-[#EAE3D6] p-0">
        <SheetHeader className="space-y-1 px-4 pb-3 pt-2 text-start">
          <SheetTitle className="text-[17px] font-extrabold">استكشاف</SheetTitle>
          <SheetDescription className="text-[13px] text-[#6B6459]">
            تصفّح أقسام المنصة
          </SheetDescription>
        </SheetHeader>
        <nav
          aria-label="استكشاف المنصة"
          className="grid grid-cols-2 gap-2 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          {GRID_LINKS.map(({ label, href, icon: Icon }) => {
            if (!Icon) return null;
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-[14px] border border-[#EAE3D6] bg-card px-3 py-3',
                  'text-[13px] font-bold text-foreground transition-colors hover:bg-[#FBF9F4]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span>{label}</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#E8F1EC] text-primary">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
                </span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
