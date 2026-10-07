'use client';

import { SectionHeader } from './SectionHeader';
import { RecentStores } from './RecentStores';
import { useStores } from '@/hooks/queries/useStores';

export function StoresSection() {
  const { data, isLoading } = useStores({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' });
  if (!isLoading && !(data?.items?.length)) return null;
  return <section className="space-y-3"><SectionHeader eyebrow="اكتشف" title="المتاجر" cta={{ href: '/stores', label: 'عرض الكل ←' }} /><RecentStores /></section>;
}
