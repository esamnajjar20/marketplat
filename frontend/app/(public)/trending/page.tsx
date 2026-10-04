import type { Metadata } from 'next';
import { SuggestionsPageClient } from '@/components/suggestions/SuggestionsPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'الرائج — سوق غزة',
  description: 'اكتشف الإعلانات والمنتجات والخدمات الأكثر رواجًا في سوق غزة.',
  path: '/trending',
});

export default function TrendingPage() {
  return <SuggestionsPageClient mode="trending" />;
}
