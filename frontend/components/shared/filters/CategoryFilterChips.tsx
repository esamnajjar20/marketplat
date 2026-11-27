'use client';

import { FilterChipGroup } from '@/components/shared/filters/FilterChipGroup';

export interface CategoryChipOption {
  id: string;
  nameAr?: string | null;
  name?: string | null;
}

interface CategoryFilterChipsProps {
  categories: readonly CategoryChipOption[];
  activeId: string;
  onSelect: (categoryId: string) => void;
  ariaLabel: string;
}

/** Shared category shortcut chips; visual and touch behavior comes from FilterChipGroup. */
export function CategoryFilterChips({
  categories,
  activeId,
  onSelect,
  ariaLabel,
}: CategoryFilterChipsProps) {
  const options = [
    { value: '', label: 'الكل' },
    ...categories.map((category) => ({
      value: category.id,
      label: category.nameAr || category.name || '',
    })),
  ];

  return (
    <FilterChipGroup
      label={ariaLabel}
      value={activeId}
      options={options}
      onChange={onSelect}
      role="group"
      className="pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      optionClassName="px-3"
    />
  );
}
