import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { prefetchHomepage } from '@/lib/prefetch';
import { buildMetadata } from '@/lib/seo';
import { PageHeader } from '@/components/shared/layout/PageHeader';
import { Layers3 } from 'lucide-react';

const CategoriesIndex = dynamic(
  () =>
    import('@/components/categories/CategoriesIndex').then(
      (module) => module.CategoriesIndex,
    ),
  {
    loading: () => (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    ),
  },
);

export const metadata: Metadata = buildMetadata({
  title: 'كل الفئات',
  description: 'تصفّح كل فئات الإعلانات والمنتجات والخدمات في سوق غزة في مكان واحد.',
  path: '/categories',
});

/**
 * فهرس الفئات — وجهة "كل الفئات" من الصفحة الرئيسية.
 * تُقرأ الفئات الثلاث من نفس payload الـ /home المُجلب مسبقاً على السيرفر،
 * فلا طلبات إضافية ويظهر المحتوى في أول HTML.
 */
export default async function CategoriesIndexPage() {
  const qc = getQueryClient();
  await prefetchHomepage(qc);

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-3 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:space-y-6 sm:px-4 sm:py-6 sm:pb-8">
      <PageHeader
        icon={<Layers3 className="h-6 w-6" />}
        title="كل الفئات"
        description="اختر فئة لتصفّح الإعلانات أو المنتجات أو الخدمات."
      />
      <HydrationBoundary state={dehydrate(qc)}>
        <CategoriesIndex />
      </HydrationBoundary>
    </div>
  );
}
