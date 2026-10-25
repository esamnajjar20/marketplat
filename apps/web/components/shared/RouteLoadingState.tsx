import { PageLoadingState, type PageLoadingVariant } from '@/components/shared/feedback/PageLoadingState';
import { LOADING_COPY } from '@/lib/loadingCopy';

/**
 * fallback موحّد لـ App Router — هيكل صفحة (بيج ناعم) بدل سبنر فقط.
 * يمكن تمرير variant لمطابقة شكل الصفحة الهدف.
 */
export function RouteLoadingState({
  variant = 'cards',
}: {
  variant?: PageLoadingVariant;
} = {}) {
  return (
    <PageLoadingState
      variant={variant}
      title={LOADING_COPY.page}
      description="نجهّز المحتوى لك…"
    />
  );
}
