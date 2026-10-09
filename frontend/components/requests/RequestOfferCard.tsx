'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatPrice } from '@/lib/formatters';
import { REQUEST_OFFER_STATUS_LABEL, REQUEST_OFFER_STATUS_VARIANT, REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { cn } from '@/lib/utils';
import type { RequestOfferListItem } from '@/types/request.types';
import { CardOfflineBadge, type CardContext } from '@/components/shared/cards/cardParts';
import { CARD_PRESS, CARD_SHELL } from '@/components/shared/cards/cardTokens';

interface Props { offer: RequestOfferListItem; context?: CardContext; action?: ReactNode; className?: string; }

/**
 * بطاقة عرض سعر — الترتيب حسب المرجع: شارة الحالة ← السعر ← المقدّم/الطلب ← الرسالة ← الوقت.
 * كل معلومة مرة واحدة: إن وُجد الطلب (قائمة "عروضي") يظهر عنوانه، وإلا يظهر اسم المقدّم.
 * زر الإجراء (قبول/سحب) خارج الـLink.
 */
export function RequestOfferCard({ offer, context = 'public', action, className }: Props) {
  const request = offer.request;
  const showOfferer = !request && context !== 'related' && Boolean(offer.offerer?.name);

  return (
    <article className={cn('h-full w-full min-w-0', className)}>
      <div className={cn(CARD_SHELL, 'relative flex h-full flex-col gap-1.5 p-3.5')}>
        <CardOfflineBadge />
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          <Badge size="xs" variant={REQUEST_OFFER_STATUS_VARIANT[offer.status]}>{REQUEST_OFFER_STATUS_LABEL[offer.status]}</Badge>
          {request?.type && <Badge size="xs" variant="outline">{REQUEST_TYPE_LABEL[request.type]}</Badge>}
        </div>
        <span dir="ltr" className="self-start font-mono text-lg font-bold tabular-nums tracking-tight text-primary">{formatPrice(offer.price)}</span>
        {request ? (
          <Link href={ROUTES.request(offer.requestId)} prefetch={false} className={cn('line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug text-foreground transition-transform duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', CARD_PRESS)}>
            {request.title ?? 'طلب'}
          </Link>
        ) : showOfferer ? (
          <p className="truncate text-sm font-semibold text-foreground">من: {offer.offerer?.name}</p>
        ) : null}
        {offer.message && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{offer.message}</p>}
        <div className="mt-auto flex min-h-5 items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
          {offer.createdAt && <span className="whitespace-nowrap tabular-nums">{<HydrationSafeRelativeTime date={offer.createdAt} />}</span>}
          {action && <div className="ms-auto shrink-0">{action}</div>}
        </div>
      </div>
    </article>
  );
}
