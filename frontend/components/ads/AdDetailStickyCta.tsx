'use client';

import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatters';
import type { Ad } from '@/types/ad.types';

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
    <div className={cn('sticky-contact-bar md:hidden border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur supports-[backdrop-filter]:bg-card/90', transitionClass, hiddenClass)}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-primary truncate">{formatPrice(ad.price)}</p>
          {ad.isNegotiable && (
            <p className="text-xs text-muted-foreground">قابل للتفاوض</p>
          )}
        </div>
        <Button
          variant="default"
          size="lg"
          className="shrink-0 gap-2 rounded-xl"
          loading={isMessaging}
          loadingText="جارٍ…"
          onClick={onMessageClick}
        >
          <MessageSquare className="h-4 w-4" />
          مراسلة
        </Button>
      </div>
    </div>
  );
}
