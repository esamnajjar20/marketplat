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
import { CloudinaryImage } from '@/components/shared/CloudinaryImage';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import { getRecentSearches } from '@/lib/recentSearches';
import { listAutoReadAds, type AutoReadMeta } from '@/lib/offlineAutoRead';
import { useAuthStore } from '@/store/auth.store';

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
  // T726 — scope auto-read entries to the current user. Previously
  // listAutoReadAds() returned every visitor's entries on this device
  // (guests included), so on a shared browser User B saw User A's
  // browsing history as soon as a search returned zero results.
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    setRecent(getRecentSearches().slice(0, 6));
    setViewed(listAutoReadAds(userId).slice(0, 6));
  }, [userId]);

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
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-1 py-2 text-start">
      {/* PHASE-3: recent searches */}
      {recent.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
            <History className="h-3.5 w-3.5" aria-hidden />
            عمليات البحث الأخيرة
          </p>
          <div className="flex flex-wrap gap-2">
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
        <p className="text-sm font-extrabold text-foreground">
          جرّب بحثًا شائعًا
        </p>
        <div className="flex flex-wrap gap-2">
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
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            شوهد مؤخرًا
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {viewed.slice(0, 4).map((ad) => (
              <Link
                prefetch={false}
                key={ad.id}
                href={ROUTES.adDetail(ad.id)}
                className="overflow-hidden rounded-2xl border border-[#EAE3D6] bg-white shadow-[0_1px_3px_rgba(42,36,29,0.06)] dark:border-border dark:bg-card"
              >
                <div className="relative flex h-[88px] items-center justify-center bg-[#F6E7DB]">
                  {ad.thumbnail ? (
                    <CloudinaryImage
                      src={ad.thumbnail}
                      alt=""
                      width={200}
                      height={88}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-7 w-7 text-primary/40" aria-hidden />
                  )}
                  <span className="absolute end-2 top-2 rounded-full bg-[rgba(42,36,29,0.78)] px-2 py-0.5 text-[10px] font-bold text-white">
                    إعلان
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <span className="line-clamp-2 text-[12px] font-bold leading-snug text-foreground">{ad.title}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Entity type shortcuts */}
      <div className="space-y-2">
        <p className="text-sm font-extrabold text-foreground">
          أو تصفّح حسب النوع
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_SHORTCUTS.map(({ type, label, icon: Icon }) => {
            const active = currentType === type;
            return (
              <Link
                prefetch={false}
                key={type}
                href={typeHref(type)}
                className={cn(
                  'flex min-h-[48px] items-center justify-between rounded-2xl border border-[#EAE3D6] bg-white px-3 py-2.5 text-sm font-bold transition-colors dark:border-border dark:bg-card',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'hover:border-primary/40',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span>{label}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F1EC] text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
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
