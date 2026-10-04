import type { Metadata } from 'next';
import { SuggestionsPageClient } from '@/components/suggestions/SuggestionsPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'مخصّص لك — سوق غزة',
  description: 'اكتشف محتوى مختارًا لك بناءً على نشاطك واهتماماتك في سوق غزة.',
  path: '/for-you',
});

export default function ForYouPage() {
  return <SuggestionsPageClient mode="for-you" />;
}
