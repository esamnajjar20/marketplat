import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

/**
 * Global App Router fallback.
 * Route-specific loading.tsx files remain free to provide tailored skeletons;
 * this boundary covers routes that do not define a more specific fallback.
 */
export default function Loading() {
  return (
    <PageLoadingState
      variant="minimal"
      title="جارٍ الانتقال بين الصفحات"
      description="نجهّز الصفحة المطلوبة…"
    />
  );
}
