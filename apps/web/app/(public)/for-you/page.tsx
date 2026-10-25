import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { buildMetadata } from '@/lib/seo';

const SuggestionsPageClient = dynamic(
  () =>
    import('@/components/suggestions/SuggestionsPageClient').then(
      (module) => module.SuggestionsPageClient,
    ),
  {
    loading: () => (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6" aria-hidden="true">
        <div className="h-12 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    ),
  },
);

export const metadata: Metadata = buildMetadata({
  title: 'مخصّص لك — سوق غزة',
  description: 'اكتشف محتوى مختارًا لك بناءً على نشاطك واهتماماتك في سوق غزة.',
  path: '/for-you',
});

export default function ForYouPage() {
  return <SuggestionsPageClient mode="for-you" />;
}
