'use client';

import { Tag } from 'lucide-react';
import { useCategoryBySlug } from '@/hooks/queries/useCategories';

interface Props { slug: string; }

export function CategoryHero({ slug }: Props) {
  const { data: category, isLoading } = useCategoryBySlug(slug);

  if (isLoading || !category) {
    return <div className="h-16 rounded-lg bg-muted animate-pulse" />;
  }

  return (
    <div className="flex items-center gap-3 py-4">
      <div className="p-2 rounded-lg bg-primary/10">
        <Tag className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">{category.nameAr}</h1>
      </div>
    </div>
  );
}
