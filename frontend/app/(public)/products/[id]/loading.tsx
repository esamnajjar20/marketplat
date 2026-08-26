import { AdDetailsSkeleton } from '@/components/shared/skeletons';

export default function ProductDetailLoading() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <AdDetailsSkeleton />
    </div>
  );
}
