import { LoadingState } from '@/components/shared/feedback/LoadingState';

/**
 * FIX SUSPENSE-EMPTY-FALLBACK-01: non-empty fallback for page/section level
 * <Suspense> boundaries (useSearchParams-based forms and tab hubs). A bare
 * <Suspense> renders nothing before the client JS loads, which looks like a
 * blank page on slow links. Server-component safe (no client-only APIs).
 */
export function SuspenseFallback() {
  return <LoadingState variant="section" />;
}
