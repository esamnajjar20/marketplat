import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { LOADING_COPY } from '@/lib/loadingCopy';

export default function Loading() {
  return (
    <PageLoadingState
      variant="search"
      title={LOADING_COPY.searching}
      description="نبحث لك…"
    />
  );
}
