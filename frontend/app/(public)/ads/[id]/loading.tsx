/**
 * Streaming loading UI for the ad detail page.
 * Uses the centralised AdDetailsSkeleton instead of a raw Skeleton call.
 */
import { AdDetailsSkeleton } from '@/components/shared/skeletons';

export default function AdDetailLoading() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <AdDetailsSkeleton />
    </div>
  );
}
