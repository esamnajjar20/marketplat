import type { Metadata } from 'next';
import { SuggestionsPageClient } from '@/components/suggestions/SuggestionsPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'اقتراحات لك — سوق غزة',
  description:
    'اقتراحات مخصّصة من إعلانات ومنتجات وخدمات تناسب اهتماماتك في سوق غزة.',
  path: '/suggestions',
});

export default function SuggestionsPage() {
  return <SuggestionsPageClient />;
}
