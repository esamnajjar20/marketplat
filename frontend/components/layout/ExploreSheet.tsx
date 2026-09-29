'use client';

import Link from 'next/link';
import {
  Search,
  ListOrdered,
  Package,
  Wrench,
  Store,
  Users,
  Trophy,
  ClipboardList,
  ChevronLeft,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * BottomNav "استكشاف" sheet — discovery only (no account hubs).
 * Phase 2: denser list with chevrons + safe-area padding; prefetch off.
 */
const EXPLORE_LINKS = [
  { label: 'بحث شامل', href: ROUTES.search, icon: Search },
  { label: 'الإعلانات', href: ROUTES.ads, icon: ListOrdered },
  { label: 'المنتجات', href: ROUTES.products, icon: Package },
  { label: 'الخدمات', href: ROUTES.services, icon: Wrench },
  { label: 'سوق الطلبات', href: ROUTES.requests, icon: ClipboardList },
  { label: 'المتاجر', href: ROUTES.stores, icon: Store },
  { label: 'مقدمو الخدمة', href: ROUTES.serviceProviders, icon: Users },
  { label: 'أفضل البائعين', href: ROUTES.sellersRanking, icon: Trophy },
] as const;

export function ExploreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0">
        <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-1">
          <SheetTitle className="text-base font-bold">استكشاف</SheetTitle>
          <p className="text-2xs text-muted-foreground">تصفّح أقسام المنصة</p>
        </SheetHeader>
        <nav
          aria-label="استكشاف المنصة"
          className="flex flex-col gap-0.5 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2"
        >
          {EXPLORE_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              // Avoid RSC prefetch storm when sheet mounts (8 links).
              prefetch={false}
              onClick={() => onOpenChange(false)}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground',
                'transition-colors hover:bg-muted',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">{label}</span>
              <ChevronLeft
                className="h-4 w-4 shrink-0 text-muted-foreground opacity-50 group-hover:opacity-80"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
