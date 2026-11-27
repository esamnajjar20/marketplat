'use client';

import { TabsBar } from '@/components/shared/ui/TabsBar';
import type { SearchType } from '@/types/search.types';

interface Props {
  value: SearchType;
  onChange: (value: SearchType) => void;
  className?: string;
}

const TABS: { value: SearchType; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'products', label: 'المنتجات' },
  { value: 'stores', label: 'المحلات' },
  { value: 'ads', label: 'الإعلانات' },
  { value: 'services', label: 'الخدمات' },
];

/** Controlled search tabs; URL synchronization remains in SearchTabsWrapper. */
export function SearchTabs({ value, onChange, className }: Props) {
  return (
    <TabsBar
      value={value}
      onChange={onChange}
      options={TABS.map((tab) => ({ ...tab, panelId: 'search-results-panel' }))}
      ariaLabel="نوع النتائج"
      variant="underline"
      className={className}
      idPrefix="search-type"
    />
  );
}
