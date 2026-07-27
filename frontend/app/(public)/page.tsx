import type { Metadata } from 'next';
import { HeroBanner }   from '@/components/home/HeroBanner';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { FeaturedAds }  from '@/components/home/FeaturedAds';
import { RecentAds }    from '@/components/home/RecentAds';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

export default function HomePage() {
  return (
    <div className="space-y-8">
      <HeroBanner />

      <section className="container mx-auto px-4 space-y-3">
        <h2 className="font-semibold text-lg">تصفح الفئات</h2>
        <CategoryGrid />
      </section>

      <section className="container mx-auto px-4 space-y-3">
        <h2 className="font-semibold text-lg">إعلانات مميزة</h2>
        <FeaturedAds />
      </section>

      <section className="container mx-auto px-4 space-y-3 pb-8">
        <h2 className="font-semibold text-lg">أحدث الإعلانات</h2>
        <RecentAds />
      </section>
    </div>
  );
}
