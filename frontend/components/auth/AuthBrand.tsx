import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { ROUTES } from '@/lib/constants';

/** شعار سوق غزة أعلى شاشات المصادقة — مطابق للتصميم. */
export function AuthBrand() {
  return (
    <IntentPrefetchLink
      href={ROUTES.home}
      className="mb-5 inline-flex items-center justify-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--legacy-primary)]/40" prefetch={false}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--legacy-primary)] text-card-title font-extrabold text-primary-foreground">
        س
      </span>
      <span className="text-[18px] font-extrabold text-[var(--legacy-primary-deep)]">سوق غزة</span>
    </IntentPrefetchLink>
  );
}
