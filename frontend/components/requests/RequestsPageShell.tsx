import { RequestsPageClient } from '@/components/requests/RequestsPageClient';
import type { RequestType } from '@/types/request.types';
import type { RequestSort } from '@/components/requests/RequestFilters';

export interface OpenRequestsPageParams {
  page: number;
  limit: 20;
  type?: RequestType;
  city?: string;
  serviceTypeId?: string;
  q?: string;
  sort: RequestSort;
}

/** Server wrapper: URL state is parsed by page.tsx and passed to the client island. */
export function RequestsPageShell({ params }: { params: OpenRequestsPageParams }) {
  return <RequestsPageClient params={params} />;
}
