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
  { loading: () => <div className="mx-auto max-w-7xl space-y-4 p-4"><Skeleton className="h-12 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div> },
);

export const metadata: Metadata = buildMetadata({
  title: 'اقتراحات لك',
  description:
    `اقتراحات مخصّصة من إعلانات ومنتجات وخدمات تناسب اهتماماتك في ${APP_NAME}.`,
  path: '/suggestions',
});

export default function SuggestionsPage() {
  return <SuggestionsPageClient />;
}
