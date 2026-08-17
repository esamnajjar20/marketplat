'use client';

import Link from 'next/link';
import { ShoppingBag, Clock } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ProductCard } from '@/components/stores/ProductCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useProducts } from '@/hooks/queries/useProducts';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';

/**
 * FEAT-HOME-DISCOVERY: "أحدث المنتجات" Home section — deliberately
 * named "أحدث" (recent), not "مميزة" (featured): Product has no
 * isFeatured concept in the schema (unlike Ad), and no store.plan
 * link either, so this section is genuinely createdAt DESC, same
 * useProducts() hook /products itself uses, just capped to 8 with no
 * pagination controls (pagination belongs to the full /products page,
 * not this homepage teaser).
 *
 * Self-contained like NearbyProvidersSection (own heading, own
 * loading/empty state) rather than folded into HomeAboveFold's
 * coordinated skeleton — see that file's doc for why. Horizontal-
 * scroll-on-mobile layout per the Home discovery spec, unlike
 * RecentAds' stacked grid-on-mobile.
 */
export function RecentProductsSection() {
  const { data, isLoading } = useProducts({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });
  const items = data?.items ?? [];
  const isAuth = useAuthStore(selectIsAuthenticated);

  const header = (
    <SectionHeader
      eyebrow="الأحدث"
      title="أحدث المنتجات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.products, label: 'عرض الكل ←' }}
    />
  );

  if (isLoading) {
    return (
      <section className="container mx-auto space-y-4 px-4 pt-10">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-40 shrink-0 sm:w-auto">
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="container mx-auto space-y-4 px-4 pt-10">
        {header}
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="لا توجد منتجات بعد"
          description={isAuth ? 'افتح متجرك وأضف أول منتج' : 'سجّل دخولك وافتح متجرك لإضافة منتجات'}
          action={
            isAuth ? (
              <Button asChild size="sm">
                <Link href={ROUTES.myStoreProductCreate}>إضافة منتج</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`${ROUTES.login}?from=${encodeURIComponent(ROUTES.myStoreProductCreate)}`}>
                  تسجيل الدخول
                </Link>
              </Button>
            )
          }
        />
      </section>
    );
  }

  return (
    <section className="container mx-auto space-y-4 px-4 pt-10">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
        {items.map((product) => (
          <div key={product.id} className="w-40 shrink-0 sm:w-auto">
            <ProductCard product={product} storeId={product.store.id} />
          </div>
        ))}
      </div>
    </section>
  );
}
