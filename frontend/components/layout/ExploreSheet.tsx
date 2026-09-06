'use client';

import Link from 'next/link';
import { Search, ListOrdered, Package, Wrench, Store, Users, Trophy } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';

/**
 * FIX (audit: "Bottom Nav بيدفن 3 من 4 أقسام رئيسية" + user direction):
 * "الخدمات"/"المتاجر"/"مقدمو الخدمة" had no direct entry point in
 * BottomNav — reaching any of them required hamburger → drawer, for a
 * multi-vertical marketplace where those three are supposed to be
 * first-class alongside ads. Adding three more bottom-bar icons was
 * explicitly rejected in favor of a single "استكشاف" entry that opens
 * this sheet, per the requested IA:
 *
 *   الرئيسية | استكشاف | + | الرسائل | حسابي
 *                 └── الإعلانات / المنتجات / الخدمات / المتاجر / مقدمو الخدمة
 *
 * "بحث شامل" is added at the top of the requested list (not dropped):
 * this sheet replaces البحث's bottom-bar slot entirely, so the plain
 * "search everything" entry point still needs a home somewhere in
 * here or it regresses. المنتجات/الخدمات/المتاجر route to their own
 * dedicated browse pages (filters, category chrome) to match how those
 * verticals are already reached from BROWSE_LINKS elsewhere.
 * ADD-ADS-PAGE: الإعلانات now does the same — app/(public)/ads/page.tsx
 * gives ads that same dedicated-page treatment, replacing the old
 * `${ROUTES.search}?type=ads` link this comment used to justify by
 * "there's no standalone /ads browse page" (no longer true). مقدمو
 * الخدمة isn't a /search type at all (it's a directory, not searchable
 * ads/products), so it still goes straight to /service-providers.
 */
const EXPLORE_LINKS = [
  { label: 'بحث شامل', href: ROUTES.search, icon: Search },
  { label: 'الإعلانات', href: ROUTES.ads, icon: ListOrdered },
  { label: 'المنتجات', href: ROUTES.products, icon: Package },
  { label: 'الخدمات', href: ROUTES.services, icon: Wrench },
  { label: 'المتاجر', href: ROUTES.stores, icon: Store },
  { label: 'أفضل البائعين', href: ROUTES.sellersRanking, icon: Trophy },
  { label: 'مقدمو الخدمة', href: ROUTES.serviceProviders, icon: Users },
] as const;

export function ExploreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0">
        <SheetHeader>
          <SheetTitle>استكشاف</SheetTitle>
        </SheetHeader>
        <nav aria-label="استكشاف المنصة" className="flex flex-col gap-1 px-4 pb-4">
          {EXPLORE_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden={true} />
              {label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export { EXPLORE_LINKS };
