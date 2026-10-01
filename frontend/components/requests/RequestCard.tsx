'use client';

import Link from 'next/link';
import { MapPin, MessageSquare, Wallet, Clock } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_LABEL,
  REQUEST_TYPE_VARIANT,
  formatRequestBudget,
  formatOffersCount,
  isRequestExpiringSoon,
} from '@/lib/requestStatus';
import type { RequestListItem } from '@/types/request.types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Props = {
  request: RequestListItem;
  /** Hide status badge on open-feed (always OPEN). */
  showStatus?: boolean;
  className?: string;
};

/**
 * بطاقة طلب محسّنة — قيمة في أول نظرة:
 * نوع + مدينة + استعجال | عنوان | ميزانية + عروض | CTA
 */
export function RequestCard({ request: r, showStatus = false, className }: Props) {
  const budget = formatRequestBudget(r.budgetMin, r.budgetMax);
  const offers = r._count?.offers;
  const expiringSoon = isRequestExpiringSoon(r.expiresAt);
  const noOffersYet = typeof offers === 'number' && offers === 0;

  return (
    <li className={cn('list-none h-full', className)}>
      <Link
        href={ROUTES.request(r.id)}
        prefetch={false}
        className={cn(
          'flex h-full flex-col rounded-xl border border-border/80 bg-card p-3.5 shadow-xs sm:p-4',
          'transition-all hover:border-primary/35 hover:bg-muted/25 hover:shadow-sm active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          expiringSoon && 'border-amber-500/40 bg-amber-500/[0.04]',
        )}
      >
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-1.5 text-2xs sm:text-xs">
          <Badge size="sm" variant={REQUEST_TYPE_VARIANT[r.type]}>
            {REQUEST_TYPE_LABEL[r.type]}
          </Badge>
          {showStatus && (
            <Badge size="sm" variant={REQUEST_STATUS_VARIANT[r.status]}>
              {REQUEST_STATUS_LABEL[r.status]}
            </Badge>
          )}
          {expiringSoon && (
            <Badge
              size="sm"
              variant="outline"
              className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              <Clock className="me-1 h-3 w-3" aria-hidden />
              ينتهي قريبًا
            </Badge>
          )}
          {r.city && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {r.city}
            </span>
          )}
          {r.createdAt && (
            <span className="ms-auto text-muted-foreground tabular-nums">
              {formatRelativeTime(r.createdAt)}
            </span>
          )}
        </div>

        {/* Title + description */}
        <h2 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-foreground sm:text-[0.95rem]">
          {r.title}
        </h2>
        {r.description ? (
          <p className="mt-1 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            {r.description}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* Value row: budget + offers */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {budget ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground tabular-nums">
              <Wallet className="h-3.5 w-3.5 text-primary" aria-hidden />
              {budget}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              ميزانية مفتوحة
            </span>
          )}
          {typeof offers === 'number' && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                noOffersYet ? 'font-medium text-primary' : 'text-muted-foreground',
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              {formatOffersCount(offers)}
            </span>
          )}
        </div>

        {/* Footer CTA */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
          <span className="truncate text-2xs text-muted-foreground sm:text-xs">
            {r.customer?.name ? `بواسطة ${r.customer.name}` : 'اطّلع على التفاصيل'}
          </span>
          <span className="shrink-0 text-xs font-semibold text-primary">
            قدّم عرضًا ←
          </span>
        </div>
      </Link>
    </li>
  );
}
