'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { productCategoriesApi } from '@/api/product-categories.api';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Horizontal category pills for the products browse page — matches the
 * design mockup (الكل / إلكترونيات / ملابس / …). Writes ?categoryId= to the URL;
 * ProductsGrid already supports categoryId via ProductsQuery.
 */
export function ProductCategoryChips() {
  const router = useRouter();
  const sp = useSearchParams();
  const activeId = sp.get('categoryId') ?? '';

  const { data } = useQuery({
    queryKey: queryKeys.productCategories.all(),
    queryFn: async () => {
      const res = await productCategoriesApi.getAll();
      return res.data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const categories = (data ?? []).filter((c) => c.isActive !== false && !c.parentId);

  function select(id: string) {
    const params = new URLSearchParams(sp.toString());
    if (id) params.set('categoryId', id);
    else params.delete('categoryId');
    params.delete('page');
    router.replace(`${ROUTES.products}?${params.toString()}`);
  }

  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="toolbar"
      aria-label="تصنيفات المنتجات"
    >
      <button
        type="button"
        aria-pressed={!activeId}
        onClick={() => select('')}
        className={cn(
          'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition-colors',
          !activeId
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-[#EAE3D6] bg-white text-[#4A433A] hover:border-primary/40 dark:border-border dark:bg-card dark:text-foreground',
        )}
      >
        الكل
      </button>
      {categories.map((cat) => {
        const selected = activeId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            aria-pressed={selected}
            onClick={() => select(cat.id)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-[#EAE3D6] bg-white text-[#4A433A] hover:border-primary/40 dark:border-border dark:bg-card dark:text-foreground',
            )}
          >
            {cat.nameAr || cat.name}
          </button>
        );
      })}
    </div>
  );
}
