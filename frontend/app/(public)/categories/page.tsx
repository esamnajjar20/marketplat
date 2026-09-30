import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { CategoriesIndex } from '@/components/categories/CategoriesIndex';
import { getQueryClient } from '@/lib/queryClient';
import { prefetchHomepage } from '@/lib/prefetch';
import { buildMetadata } from '@/lib/seo';

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
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">كل الفئات</h1>
        <p className="text-sm text-muted-foreground">اختر فئة لتصفّح الإعلانات أو المنتجات أو الخدمات.</p>
      </header>
      <HydrationBoundary state={dehydrate(qc)}>
        <CategoriesIndex />
      </HydrationBoundary>
    </div>
  );
}
