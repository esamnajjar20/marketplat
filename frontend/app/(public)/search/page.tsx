import type { Metadata } from 'next';
import { SearchPageClient } from '@/components/search/SearchPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'البحث', noIndex: true });

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  return <SearchPageClient query={q ?? ''} />;
}
