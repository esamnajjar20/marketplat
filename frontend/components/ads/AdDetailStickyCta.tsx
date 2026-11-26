'use client';

import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';
import type { Ad } from '@/types/ad.types';
import { STICKY_BAR } from '@/components/shared/detail/detailTokens';

interface AdDetailStickyCtaProps {
  ad: Ad;
  isOwnAd: boolean;
  transitionClass: string;
  hiddenClass: string;
  onMessageClick: () => void;
  isMessaging: boolean;
}

/**
 * Mobile sticky CTA for ad detail.
 * The price is intentionally NOT pinned here anymore (it was distracting);
 * it stays in the metadata block of the page. Only the primary action remains.
 */
export function AdDetailStickyCta({
  ad,
  isOwnAd,
  transitionClass,
  hiddenClass,
  onMessageClick,
  isMessaging,
}: AdDetailStickyCtaProps) {
  if (isOwnAd) return null;

  const isSold = ad.status === 'SOLD';

  return (
    <div className={cn(STICKY_BAR, 'md:hidden', transitionClass, hiddenClass)}>
      <Button
        variant="default"
        size="lg"
        className="min-h-11 w-full flex-1 gap-1.5 rounded-xl font-bold"
        loading={isMessaging}
        loadingText="جارٍ…"
        disabled={isSold}
        onClick={onMessageClick}
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        {isSold ? 'غير متاح' : 'مراسلة'}
      </Button>
    </div>
  );
}
