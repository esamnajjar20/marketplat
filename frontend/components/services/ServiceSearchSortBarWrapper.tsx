'use client';
import { usePathname } from 'next/navigation';
import { SearchSortBar } from '@/components/shared/SearchSortBar';
import { SERVICE_SORT_OPTIONS } from '@/lib/constants';
export function ServiceSearchSortBarWrapper() {
  return <SearchSortBar basePath={usePathname()} config={{ mode: 'combined', options: SERVICE_SORT_OPTIONS, defaultSortBy: 'createdAt', defaultSortOrder: 'desc' }} />;
}
