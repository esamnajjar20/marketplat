'use client';

import { SectionHeader } from './SectionHeader';
import { RecentProducts } from './RecentProducts';
import { useProducts } from '@/hooks/queries/useProducts';

export function ProductsSection() {
  const { data, isLoading } = useProducts({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });
  if (!isLoading && !(data?.items?.length)) return null;
  return <section className="space-y-3"><SectionHeader eyebrow="تسوّق" title="أحدث المنتجات" cta={{ href: '/products', label: 'عرض الكل ←' }} /><RecentProducts /></section>;
}
