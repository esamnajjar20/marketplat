import { RouteLoadingState } from '@/components/shared/RouteLoadingState';

/** FIX LOADING-BOUNDARY-01: non-empty route fallback — هيكل موحّد. */
export default function Loading() {
  return <RouteLoadingState variant="home" />;
}
