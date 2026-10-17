import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      variant="cards"
      title="جارٍ فتح الصفحة"
      description="لحظة من فضلك…"
    />
  );
}
