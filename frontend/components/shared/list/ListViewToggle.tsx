'use client';

import { LayoutGrid, LayoutList } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type ListView = 'grid' | 'list';

interface Props {
  value?: ListView;
  onChange?: (value: ListView) => void;
  className?: string;
  /** When supplied by a Server Page, avoids useSearchParams during SSR. */
  searchParamsString?: string;
}

function ListViewToggleWithParams({ value, onChange, className, searchParamsString }: Props & { searchParamsString: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = value ?? (new URLSearchParams(searchParamsString).get('view') === 'list' ? 'list' : 'grid');

  function setView(next: ListView) {
    onChange?.(next);
    if (onChange) return;
    const params = new URLSearchParams(searchParamsString);
    if (next === 'grid') params.delete('view');
    else params.set('view', next);
    params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className={cn('flex items-center gap-1 rounded-xl border bg-card p-1', className)} role="group" aria-label="طريقة عرض النتائج">
      <button type="button" onClick={() => setView('grid')} aria-label="عرض شبكي" aria-pressed={current === 'grid'}
        className={cn('inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg transition-colors', current === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60')}>
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => setView('list')} aria-label="عرض قائمة" aria-pressed={current === 'list'}
        className={cn('inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg transition-colors', current === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60')}>
        <LayoutList className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ListViewToggleFromUrl(props: Props) {
  const searchParams = useSearchParams();
  return <ListViewToggleWithParams {...props} searchParamsString={searchParams.toString()} />;
}

/** Consistent browse-list view switch. The choice is URL-backed by default. */
export function ListViewToggle(props: Props) {
  if (props.searchParamsString !== undefined) {
    return <ListViewToggleWithParams {...props} searchParamsString={props.searchParamsString} />;
  }
  return <ListViewToggleFromUrl {...props} />;
}
