'use client';

import Link from 'next/link';
import { LayoutGrid, Store } from 'lucide-react';
import { useMemo } from 'react';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { toCategoryItems, type Item } from '@/lib/categoryItems';
import { ROUTES } from '@/lib/constants';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import { iconFor } from '@/lib/categoryItems';

export { iconFor, interleave } from '@/lib/categoryItems';
export type { Item, SourceType } from '@/lib/categoryItems';

export const MAX_HOME_CATEGORIES = 14;

type UnifiedCategory = Item | {
  id: string;
  nameAr: string;
  slug: string;
  type: 'store';
  href: string;
};

function dedupe(items: UnifiedCategory[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.nameAr.trim().replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One unified category discovery row — ads/products/services/store types share one visual language. */
export function CategoriesRow() {
  const feed = useHomeFeed();
  const categories = feed.data?.bootstrap.categories;
  const storeTypes = feed.data?.bootstrap.storeTypes ?? [];
  const categoriesLoading = feed.isPending;

  const unified = useMemo(() => {
    const ads = toCategoryItems('ad', categories?.ads);
    const products = toCategoryItems('product', categories?.products);
    const services = toCategoryItems('service', categories?.services);
    const stores: UnifiedCategory[] = storeTypes
      .filter((type) => type.hasActiveStores)
      .map((type) => ({
        id: type.id,
        nameAr: type.nameAr,
        slug: type.slug,
        type: 'store' as const,
        href: `${ROUTES.stores}?type=${encodeURIComponent(type.slug)}`,
      }));

    const all = dedupe([...ads, ...products, ...services, ...stores]);
    const queues: Record<'ad' | 'product' | 'service' | 'store', UnifiedCategory[]> = {
      ad: all.filter((item) => item.type === 'ad'),
      product: all.filter((item) => item.type === 'product'),
      service: all.filter((item) => item.type === 'service'),
      store: all.filter((item) => item.type === 'store'),
    };
    const pattern: Array<keyof typeof queues> = ['ad', 'product', 'service', 'store'];
    const out: UnifiedCategory[] = [];
    let cursor = 0;
    while (out.length < all.length && cursor < all.length * 8) {
      const type = pattern[cursor % pattern.length]!;
      const next = queues[type].shift();
      if (next) out.push(next);
      cursor += 1;
    }
    return out.slice(0, MAX_HOME_CATEGORIES);
  }, [categories, storeTypes]);

  if (categoriesLoading) {
    return (
      <div className="flex gap-2.5 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[5.5rem] w-[5.5rem] shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (unified.length === 0) return null;

  return (
    <section aria-label="الفئات" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold sm:text-base">الفئات</h2>
        <Link href={ROUTES.categories} prefetch={false} className="text-xs font-semibold text-primary hover:underline">
          كل الفئات ←
        </Link>
      </div>
      <div className="-mx-3 flex gap-2.5 overflow-x-auto overscroll-x-contain px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-4 sm:px-4">
        {unified.map((item) => {
          const Icon = item.type === 'store' ? Store : iconFor(item.slug, item.nameAr, item.type);
          return (
            <Link
              key={`${item.type}-${item.id}`}
              href={item.href}
              prefetch={false}
              className={cn(
                'group inline-flex min-h-[5.5rem] w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/80 bg-card px-2 py-2.5 text-center shadow-sm',
                'transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md active:scale-[0.995]',
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10 transition-colors group-hover:bg-primary/15">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="line-clamp-2 w-full text-xs font-semibold leading-tight text-foreground">
                {item.nameAr}
              </span>
            </Link>
          );
        })}
        <Link
          href={ROUTES.categories}
          prefetch={false}
          className="inline-flex min-h-[5.5rem] w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/80 px-2 py-2.5 text-center transition-colors hover:border-primary/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <LayoutGrid className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-xs font-semibold leading-tight">كل الفئات</span>
        </Link>
      </div>
    </section>
  );
}
