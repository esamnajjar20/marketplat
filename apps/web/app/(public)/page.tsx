import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { HomePageContent } from '@/components/home/HomePageContent';
import { getQueryClient } from '@/lib/queryClient';
import { prefetchHomeFeed } from '@/lib/prefetch';
import { buildMetadata } from '@/lib/seo';
import { buildHomePageJsonLd, safeJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata({
  title: 'سوق غزة — إعلانات ومنتجات وخدمات',
  description:
    'منصة سوق غزة المحلي: إعلانات مبوبة، منتجات، خدمات، ومتاجر قريبة منك. ابحث، اشترِ، أو اعرض مجاناً — تواصل مباشر بلا وسطاء.',
  path: '/',
});

/**
 * Homepage — server component.
 *
 * The guest/no-city GET /home payload is prefetched here and handed to the
 * client through <HydrationBoundary>, so the first HTML already contains the
 * carousel, categories and rails (LCP/SEO) instead of a skeleton that waits
 * for hydration → auth → fetch. Failure is harmless: the client falls back to
 * its normal fetch.
 */
export default async function HomePage() {
  const jsonLd = buildHomePageJsonLd();
  const qc = getQueryClient();
  await prefetchHomeFeed(qc);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <HydrationBoundary state={dehydrate(qc)}>
        <HomePageContent />
      </HydrationBoundary>
    </>
  );
}
