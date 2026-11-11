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

  return (
    <div className={cn(STICKY_BAR, 'md:hidden', transitionClass, hiddenClass)}>
      <div className="min-w-0 flex-1">
        <div className="text-2xs-tight text-muted-foreground">السعر</div>
        <b className="truncate text-card-title font-extrabold tabular-nums text-primary">
          {formatPrice(ad.price)}
        </b>
        {ad.isNegotiable && (
          <p className="text-2xs-tight text-muted-foreground">قابل للتفاوض</p>
        )}
      </div>
      <Button
        variant="default"
        size="lg"
        className="flex-[1.6] gap-1.5 rounded-xl font-bold"
        loading={isMessaging}
        loadingText="جارٍ…"
        onClick={onMessageClick}
      >
        <MessageSquare className="h-4 w-4" />
        مراسلة
      </Button>
    </div>
  );
}
