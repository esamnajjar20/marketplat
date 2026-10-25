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
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';

interface Props {
  offer: RequestOfferListItem;
  context?: CardContext;
  action?: ReactNode;
  className?: string;
}

/**
 * بطاقة عرض سعر — مطابقة لتصميم صاحب الطلب / القائمة العامة.
 * صاحب الطلب: أفاتار + اسم + سعر + رسالة + أزرار قبول/مراسلة.
 */
export function RequestOfferCard({ offer, context = 'public', action, className }: Props) {
  const request = offer.request;
  const isOwnerView = context === 'owner';
  const showOfferer = isOwnerView || (!request && context !== 'related' && Boolean(offer.offerer?.name));
  const offererName = offer.offerer?.name ?? 'مقدّم';
  const initial = offererName.trim().charAt(0) || '؟';

  if (isOwnerView) {
    return (
      <article className={cn('h-full w-full min-w-0', className)}>
        <div
          className={cn(
            'relative flex h-full flex-col gap-2.5 rounded-2xl border border-[#EAE3D6] bg-card p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.06)]',
          )}
        >
          <CardOfflineBadge />
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8F1EC] text-[16px] font-extrabold text-[#1F4D33]">
              {offer.offerer?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={offer.offerer.avatarUrl}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="truncate text-[14px] font-bold text-[#2A241D]">
                  من: {offererName}
                </p>
                <span
                  dir="ltr"
                  className="font-mono text-[16px] font-extrabold tabular-nums text-[#1F4D33]"
                >
                  {formatPrice(offer.price)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge size="xs" variant={REQUEST_OFFER_STATUS_VARIANT[offer.status]}>
                  {REQUEST_OFFER_STATUS_LABEL[offer.status]}
                </Badge>
                {offer.createdAt && (
                  <span className="text-[11px] text-[#6B6459]">
                    <HydrationSafeRelativeTime date={offer.createdAt} />
                  </span>
                )}
              </div>
            </div>
          </div>

          {offer.message && (
            <p className="text-[13px] leading-relaxed text-[#4A433A]">{offer.message}</p>
          )}

          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {offer.offererUserId && (
              <MessageUserButtonGate
                targetUserId={offer.offererUserId}
                size="sm"
                variant="outline"
                label="مراسلة"
                className="h-10 flex-1 rounded-xl border-[#CFE0D5] font-bold text-[#1F4D33]"
              />
            )}
            {action && <div className="min-w-[7rem] flex-[1.2]">{action}</div>}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn('h-full w-full min-w-0', className)}>
      <div className={cn(CARD_SHELL, 'relative flex h-full flex-col gap-1.5 p-2.5 sm:p-3.5')}>
        <CardOfflineBadge />
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          <Badge size="xs" variant={REQUEST_OFFER_STATUS_VARIANT[offer.status]}>
            {REQUEST_OFFER_STATUS_LABEL[offer.status]}
          </Badge>
          {request?.type && (
            <Badge size="xs" variant="outline">
              {REQUEST_TYPE_LABEL[request.type]}
            </Badge>
          )}
        </div>
        <span
          dir="ltr"
          className="self-start font-mono text-lg font-bold tabular-nums tracking-tight text-primary"
        >
          {formatPrice(offer.price)}
        </span>
        {request ? (
          <Link
            href={ROUTES.request(offer.requestId)}
            prefetch={false}
            className={cn(
              'line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug text-foreground transition-transform duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              CARD_PRESS,
            )}
          >
            {request.title ?? 'طلب'}
          </Link>
        ) : showOfferer ? (
          <p className="truncate text-sm font-semibold text-foreground">من: {offer.offerer?.name}</p>
        ) : null}
        {offer.message && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{offer.message}</p>
        )}
        <div className="mt-auto flex min-h-5 items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
          {offer.createdAt && (
            <span className="whitespace-nowrap tabular-nums">
              <HydrationSafeRelativeTime date={offer.createdAt} />
            </span>
          )}
          {action && <div className="ms-auto shrink-0">{action}</div>}
        </div>
      </div>
    </article>
  );
}
