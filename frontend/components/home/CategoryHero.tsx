'use client';

import { Tag, AlertTriangle } from 'lucide-react';
import { useCategoryBySlug } from '@/hooks/queries/useCategories';

interface Props { slug: string; }

export function CategoryHero({ slug }: Props) {
  const { data: category, isLoading, isError } = useCategoryBySlug(slug);

  if (isLoading) {
    return <div className="h-16 rounded-lg bg-muted animate-pulse" />;
  }

  // UX-FIX P0-2: previously `isLoading || !category` fell through to the
  // same pulsing skeleton on fetch failure too — indistinguishable from
  // "still loading", so it just sat there forever with no indication
  // anything went wrong. This is a page header, not the main content
  // (the ad grid below still loads independently), so a compact inline
  // notice fits better here than a full EmptyState block.
  if (isError || !category) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <AlertTriangle className="h-5 w-5" />
        <p className="text-sm">تعذّر تحميل بيانات هذا القسم</p>
      </div>
    );
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
