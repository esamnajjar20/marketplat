import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function SearchLoading() {
  return (
    <PageLoadingState
      variant="cards"
      title="جارٍ البحث"
      description="نبحث عن أفضل النتائج لك…"
    />
  );
}
