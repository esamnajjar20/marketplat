'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Car,
  Home,
  Smartphone,
  Sofa,
  Store,
  Package,
  Wrench,
  Megaphone,
  History,
  Eye,
} from 'lucide-react';
import { useCategories } from '@/hooks/queries/useCategories';
import { ROUTES } from '@/lib/constants';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import { getRecentSearches } from '@/lib/recentSearches';
import { listAutoReadAds, type AutoReadMeta } from '@/lib/offlineAutoRead';

/**
 * Escape hatches under zero-result search:
 * 0) recent searches (local)
 * 1) popular query chips
 * 2) recently viewed ads (auto-read cache)
 * 3) entity-type shortcuts
 * 4) top-level categories
 */

const POPULAR_QUERIES = [
  { q: 'سيارة', icon: Car },
  { q: 'شقة', icon: Home },
  { q: 'موبايل', icon: Smartphone },
  { q: 'أثاث', icon: Sofa },
] as const;

const TYPE_SHORTCUTS = [
  { type: 'ads', label: 'إعلانات', icon: Megaphone },
  { type: 'products', label: 'منتجات', icon: Package },
  { type: 'stores', label: 'متاجر', icon: Store },
  { type: 'services', label: 'خدمات', icon: Wrench },
] as const;

export function EmptySearchSuggestions() {
  const sp = useSearchParams();
  const currentType = sp.get('type') ?? 'all';
  const { data: categories, isLoading } = useCategories();
  const top = (categories ?? []).filter((c) => !c.parentId).slice(0, 8);

  const [recent, setRecent] = useState<string[]>([]);
  const [viewed, setViewed] = useState<AutoReadMeta[]>([]);

  useEffect(() => {
    setRecent(getRecentSearches().slice(0, 6));
    setViewed(listAutoReadAds().slice(0, 6));
  }, []);

  function searchHref(q: string) {
    const params = new URLSearchParams();
    params.set('q', q);
    if (currentType && currentType !== 'all') params.set('type', currentType);
    return `${ROUTES.search}?${params.toString()}`;
  }

  function typeHref(type: string) {
    return `${ROUTES.search}?type=${type}`;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-2 py-4 text-center">
      {/* PHASE-3: recent searches */}
      {recent.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" aria-hidden />
            بحثت مؤخرًا
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {recent.map((q) => (
              <Link
                prefetch={false}
                key={q}
                href={searchHref(q)}
                className={cn(
                  'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border bg-card px-3.5 py-2',
                  'text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5',
                )}
              >
                {q}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Popular */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          جرّب بحثًا شائعًا
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {POPULAR_QUERIES.map(({ q, icon: Icon }) => (
            <Link
              prefetch={false}
              key={q}
              href={searchHref(q)}
              className={cn(
                'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border bg-card px-3.5 py-2',
                'text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5',
              )}
            >
              <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
              {q}
            </Link>
          ))}
        </div>
      </div>

      {/* PHASE-3: recently viewed ads */}
      {viewed.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            شوهد مؤخرًا
          </p>
          <div className="flex flex-col gap-1.5 text-start">
            {viewed.map((ad) => (
              <Link
                prefetch={false}
                key={ad.id}
                href={ROUTES.adDetail(ad.id)}
                className="rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="line-clamp-1 font-medium">{ad.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Entity type shortcuts */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          أو تصفّح حسب النوع
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPE_SHORTCUTS.map(({ type, label, icon: Icon }) => {
            const active = currentType === type;
            return (
              <Link
                prefetch={false}
                key={type}
                href={typeHref(type)}
                className={cn(
                  'flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-card hover:border-primary/40 hover:bg-primary/5',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          تصفّح التصنيفات
        </p>
        {isLoading ? (
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-full" />
            ))}
          </div>
        ) : top.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {top.map((cat) => (
              <Link
                prefetch={false}
                key={cat.id}
                href={ROUTES.category(cat.slug)}
                className="inline-flex min-h-[36px] items-center rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:bg-primary/5"
              >
                {cat.nameAr}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
