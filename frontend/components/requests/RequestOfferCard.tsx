'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Clock, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { REQUEST_OFFER_STATUS_LABEL, REQUEST_OFFER_STATUS_VARIANT, REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { cn } from '@/lib/utils';
import type { RequestOfferListItem } from '@/types/request.types';
import { CardOfflineBadge, type CardContext } from '@/components/shared/cards/cardParts';
import { CARD_SHELL } from '@/components/shared/cards/cardTokens';

interface Props { offer: RequestOfferListItem; context?: CardContext; action?: ReactNode; className?: string; }

export function RequestOfferCard({ offer, context = 'public', action, className }: Props) {
  const showOfferer = context === 'favorites' || context === 'public';
  return (
    <article className={cn('h-full w-full min-w-0', className)}>
      <div className={cn(CARD_SHELL, 'relative flex h-full flex-col p-3.5')}>
        <CardOfflineBadge />
        <div className="flex min-w-0 items-start justify-between gap-3">
          <Link href={ROUTES.request(offer.requestId)} className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex flex-wrap items-center gap-1.5"><Badge size="xs" variant={REQUEST_OFFER_STATUS_VARIANT[offer.status]}>{REQUEST_OFFER_STATUS_LABEL[offer.status]}</Badge>{offer.request?.type && <span className="text-xs text-muted-foreground">{REQUEST_TYPE_LABEL[offer.request.type]}</span>}</div>
            <h3 className="mt-2 line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug">{offer.request?.title ?? 'طلب'}</h3>
          </Link>
          {action}
        </div>
        <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-semibold text-foreground tabular-nums" dir="ltr"><Wallet className="h-3.5 w-3.5 text-primary" aria-hidden />{formatPrice(offer.price)}</span>
          {showOfferer && offer.offerer?.name && <span className="truncate">{offer.offerer.name}</span>}
          {offer.createdAt && <span className="ms-auto inline-flex shrink-0 items-center gap-1 tabular-nums"><Clock className="h-3 w-3" aria-hidden />{formatRelativeTime(offer.createdAt)}</span>}
        </div>
        {offer.message && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{offer.message}</p>}
      </div>
    </article>
  );
}
