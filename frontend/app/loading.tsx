import { RouteLoadingState } from '@/components/shared/RouteLoadingState';

/** Global fallback: intentionally identical to route-group loading boundaries. */
export default function Loading() {
  return <RouteLoadingState />;
}
