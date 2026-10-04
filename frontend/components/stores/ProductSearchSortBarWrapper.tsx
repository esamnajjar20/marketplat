'use client';
import { usePathname } from 'next/navigation';
import { SearchSortBar } from '@/components/shared/SearchSortBar';
import { PRODUCT_SORT_OPTIONS } from '@/lib/constants';
export function ProductSearchSortBarWrapper() {
  return <SearchSortBar basePath={usePathname()} config={{ mode: 'combined', options: PRODUCT_SORT_OPTIONS, defaultSortBy: 'createdAt', defaultSortOrder: 'desc' }} />;
}
