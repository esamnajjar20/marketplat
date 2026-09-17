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
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';

/**
 * BottomNav "استكشاف" sheet — discovery only (no account hubs).
 * Order matches BROWSE_LINKS (minus الرئيسية which is already on the bar).
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
        <SheetHeader>
          <SheetTitle>استكشاف</SheetTitle>
        </SheetHeader>
        <nav aria-label="استكشاف المنصة" className="flex flex-col gap-1 px-4 pb-6">
          {EXPLORE_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
