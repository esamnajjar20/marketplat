import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { buildMetadata } from '@/lib/seo';
import { APP_NAME } from '@/lib/constants';
import { Skeleton } from '@/components/shared/ui/Skeleton';

const SuggestionsPageClient = dynamic(
  () =>
    import('@/components/suggestions/SuggestionsPageClient').then(
      (module) => module.SuggestionsPageClient,
    ),
  {
    loading: () => (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6" aria-hidden="true">
        <Skeleton className="h-12 rounded-2xl" />
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
  title: 'مخصّص لك',
  description: `اكتشف محتوى مختارًا لك بناءً على نشاطك واهتماماتك في ${APP_NAME}.`,
  path: '/for-you',
});

export default function ForYouPage() {
  return <SuggestionsPageClient mode="for-you" />;
}
