'use client';

import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatters';
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
  // Prefer a clear sold label over "السعر غير معلن" + strikethrough.
  const priceLabel = isSold
    ? ad.price == null
      ? 'مُباع'
      : formatPrice(ad.price)
    : ad.price == null
      ? 'السعر غير معلن'
      : formatPrice(ad.price);

  return (
    <div className={cn(STICKY_BAR, 'md:hidden', transitionClass, hiddenClass)}>
      <div className="min-w-0 flex-1">
        <div className="text-2xs-tight text-muted-foreground">السعر</div>
        <b
          className={cn(
            'truncate text-sm font-extrabold tabular-nums tracking-tight',
            isSold && ad.price != null && 'text-muted-foreground line-through',
            isSold && ad.price == null && 'text-muted-foreground',
            !isSold && ad.price == null && 'text-xs text-muted-foreground',
            !isSold && ad.price != null && 'text-primary',
          )}
        >
          {priceLabel}
        </b>
        {isSold && ad.price != null ? (
          <p className="text-2xs-tight font-semibold text-muted-foreground">مُباع</p>
        ) : !isSold && ad.isNegotiable ? (
          <p className="text-2xs-tight text-muted-foreground">قابل للتفاوض</p>
        ) : null}
      </div>
      <Button
        variant="default"
        size="lg"
        className="flex-[1.6] gap-1.5 rounded-xl font-bold"
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
