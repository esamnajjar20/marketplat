import { RouteLoadingState } from '@/components/shared/RouteLoadingState';

/** FIX LOADING-BOUNDARY-01: non-empty route fallback (see docs/LOADING_SYSTEM.md). */
export default function Loading() {
  return <RouteLoadingState />;
}
