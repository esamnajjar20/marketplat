import { LoadingState } from '@/components/shared/feedback/LoadingState';
import { LOADING_COPY } from '@/lib/loadingCopy';

/** One consistent App Router fallback, shared by root and route-group boundaries. */
export function RouteLoadingState() {
  return (
    <LoadingState
      variant="page"
      size="lg"
      label={LOADING_COPY.page}
      description="نجهّز المحتوى لك…"
      className="min-h-[45vh] min-h-[45dvh]"
    />
  );
}
