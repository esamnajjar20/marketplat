import type { Metadata }    from 'next';
import { Suspense }         from 'react';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { CategoryHero }     from '@/components/home/CategoryHero';
import { SearchFilters }    from '@/components/ads/SearchFilters';
import { SearchResults }    from '@/components/ads/SearchResults';
import { getQueryClient }   from '@/lib/queryClient';
import { prefetchCategories } from '@/lib/prefetch';
import { buildCategoryMetadata } from '@/lib/seo';
import { LoadingSpinner }   from '@/components/shared/feedback/LoadingSpinner';

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildCategoryMetadata({ slug, name: slug });
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const qc = getQueryClient();
  await prefetchCategories(qc);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <HydrationBoundary state={dehydrate(qc)}>
        <CategoryHero slug={slug} />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
            <Suspense><SearchFilters categorySlug={slug} /></Suspense>
          </aside>
          <main className="lg:col-span-3">
            <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
              <SearchResults categorySlug={slug} />
            </Suspense>
          </main>
        </div>
      </HydrationBoundary>
    </div>
  );
}
