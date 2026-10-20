'use client';

/**
 * Wraps search results: pull-to-refresh invalidates all unified search queries.
 * Use in app/(public)/search/page.tsx around <SearchResults />.
 */

import { useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PullToRefresh } from '@/components/shared/ui/PullToRefresh';

export function SearchPullToRefresh({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const onRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['search'] });
  }, [queryClient]);

  return <PullToRefresh onRefresh={onRefresh}>{children}</PullToRefresh>;
}
