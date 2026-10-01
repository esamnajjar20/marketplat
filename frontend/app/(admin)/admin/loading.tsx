import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

// ADMIN-HUB-01: replaces the eleven per-section loading skeletons.
export default function AdminLoading() {
  return <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز لوحة الإدارة…" />;
}
