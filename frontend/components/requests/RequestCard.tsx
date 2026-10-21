'use client';

import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import Link from 'next/link';
import { MapPin, Wallet, Clock } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_LABEL,
  formatRequestBudget,
  formatOffersCount,
  isRequestExpiringSoon,
} from '@/lib/requestStatus';
import type { RequestListItem } from '@/types/request.types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useNowAfterMount, type CardContext } from '@/components/shared/cards/cardParts';
import { CARD_PRESS, CARD_FOCUS } from '@/components/shared/cards/cardTokens';

type Props = {
  request: RequestListItem;
  context?: CardContext;
  showStatus?: boolean;
  className?: string;
};

/**
 * بطاقة طلب — تصميم سوق الطلبات (قائمة أفقية + قدّم عرضك).
 */
export function RequestCard({ request: r, context = 'public', showStatus = false, className }: Props) {
  const budget = formatRequestBudget(r.budgetMin, r.budgetMax);
  const offers = r._count?.offers;
  const hydrationNow = useNowAfterMount(true);
  const expiringSoon =
    hydrationNow !== null && isRequestExpiringSoon(r.expiresAt, undefined, hydrationNow);
  const showCity = context !== 'owner';
  const showTime = context !== 'related';
  const detailHref = ROUTES.request(r.id);

  return (
    <article className={cn('w-full min-w-0', className)}>
      <div
        className={cn(
          'rounded-2xl border border-[#EAE3D6] bg-white p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.06)] dark:border-border dark:bg-card',
          expiringSoon && 'border-warning/40',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {showStatus ? (
              <Badge size="xs" variant={REQUEST_STATUS_VARIANT[r.status]}>
                {REQUEST_STATUS_LABEL[r.status]}
              </Badge>
            ) : null}
            <span className="inline-flex h-6 items-center rounded-full bg-[#E8F1EC] px-2.5 text-[11px] font-bold text-[#1F4D33]">
              {REQUEST_TYPE_LABEL[r.type]}
            </span>
            {expiringSoon ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#FBF0D9] px-2.5 text-[11px] font-bold text-[#7A4B07]">
                <Clock className="h-3 w-3" aria-hidden />
                ينتهي قريبًا
              </span>
            ) : null}
          </div>
        </div>

        <Link
          href={detailHref}
          prefetch={false}
          className={cn('mt-2 block focus-visible:outline-none', CARD_FOCUS)}
        >
          <h2
            title={r.title}
            className="line-clamp-2 text-sm font-extrabold leading-snug tracking-tight text-foreground"
          >
            {r.title}
          </h2>
          {r.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {r.description}
            </p>
          ) : null}
        </Link>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-extrabold tabular-nums text-[#2A241D] dark:text-foreground">
            <Wallet className="h-3.5 w-3.5 text-[#397F56]" aria-hidden />
            {budget ?? 'ميزانية مفتوحة'}
          </span>
          {showCity && r.city ? (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {r.city}
            </span>
          ) : null}
          {showTime && r.createdAt ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <HydrationSafeRelativeTime date={r.createdAt} />
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {typeof offers === 'number' ? formatOffersCount(offers) : '0 عروض'}
          </span>
          <Link
            href={detailHref}
            prefetch={false}
            className={cn(
              'inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[#397F56] px-4 text-xs font-bold text-white transition-opacity hover:opacity-95',
              CARD_FOCUS,
              CARD_PRESS,
            )}
          >
            قدّم عرضك
          </Link>
        </div>
      </div>
    </article>
  );
}
