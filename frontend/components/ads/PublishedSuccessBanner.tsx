'use client';

import { useEffect, useState } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { usePathname, useSearchParams } from 'next/navigation';
import { SuccessCard } from '@/components/shared/feedback/SuccessCard';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { writeClientUrl } from '@/lib/urlWithParams';

/**
 * يظهر بعد نشر إعلان جديد (?published=1) — مطابقة لبطاقة «تم نشر إعلانك».
 */
export function PublishedSuccessBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get('published') === '1') {
      setVisible(true);
      // نظّف الـ query حتى لا تعود البطاقة عند الرجوع
      const next = new URLSearchParams(searchParams.toString());
      next.delete('published');
      const q = next.toString();
      writeClientUrl(q ? `${pathname}?${q}` : pathname, 'replace');
    }
  }, [searchParams, pathname]);

  if (!visible) return null;

  return (
    <div className="mb-5">
      <SuccessCard
        title="تم نشر إعلانك"
        description="إعلانك الآن ظاهر للجميع. يمكنك تعديله أو متابعة مشاهداته من «إعلاناتي»."
        primaryAction={
          <Button asChild className="h-11 w-full rounded-xl font-bold">
            <IntentPrefetchLink href={pathname} prefetch={false}>عرض الإعلان</IntentPrefetchLink>
          </Button>
        }
        secondaryAction={
          <Button asChild variant="outline" className="h-11 w-full rounded-xl border-[var(--legacy-border)] font-bold">
            <IntentPrefetchLink href={ROUTES.myAds} prefetch={false}>إعلاناتي</IntentPrefetchLink>
          </Button>
        }
      />
    </div>
  );
}
