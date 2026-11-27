'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { FilterField } from './FilterField';

interface FilterSearchInputProps {
  id: string;
  value: string;
  placeholder: string;
  onApply: (value: string) => void;
  label?: string;
}

/** Shared keyword field; commits on Enter or blur without duplicate commits. */
export function FilterSearchInput({
  id,
  value,
  placeholder,
  onApply,
  label = 'بحث',
}: FilterSearchInputProps) {
  const [draft, setDraft] = useState(value);
  const lastApplied = useRef(value);

  useEffect(() => {
    setDraft(value);
    lastApplied.current = value;
  }, [value]);

  function commit() {
    if (draft === lastApplied.current) return;
    lastApplied.current = draft;
    onApply(draft);
  }

  return (
    <FilterField id={id} label={label}>
      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border border-input bg-transparent pe-3 ps-9 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </FilterField>
  );
}
