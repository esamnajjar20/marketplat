'use client';

import Link from 'next/link';
import { MapPin, MessageSquare, Wallet } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_LABEL,
  REQUEST_TYPE_VARIANT,
  formatRequestBudget,
} from '@/lib/requestStatus';
import type { RequestListItem } from '@/types/request.types';
import { Badge } from '@/components/shared/ui/Badge';
import { cn } from '@/lib/utils';

type Props = {
  request: RequestListItem;
  /** Hide status badge on open-feed (always OPEN). */
  showStatus?: boolean;
  className?: string;
};

export function RequestCard({ request: r, showStatus = false, className }: Props) {
  const budget = formatRequestBudget(r.budgetMin, r.budgetMax);
  const offers = r._count?.offers;

  return (
    <li className={cn('list-none', className)}>
      <Link
        href={ROUTES.request(r.id)}
        className={cn(
          'block rounded-xl border border-border/80 bg-card p-3.5 shadow-xs sm:p-4',
          'transition-colors hover:border-primary/30 hover:bg-muted/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={REQUEST_TYPE_VARIANT[r.type]}>{REQUEST_TYPE_LABEL[r.type]}</Badge>
          {showStatus && (
            <Badge variant={REQUEST_STATUS_VARIANT[r.status]}>
              {REQUEST_STATUS_LABEL[r.status]}
            </Badge>
          )}
          {r.city && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden />
              {r.city}
            </span>
          )}
          {typeof offers === 'number' && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="h-3 w-3" aria-hidden />
              {offers} عروض
            </span>
          )}
          {r.createdAt && (
            <span className="text-muted-foreground ms-auto">{formatRelativeTime(r.createdAt)}</span>
          )}
        </div>

        <h2 className="mt-2 text-[0.95rem] font-semibold leading-snug sm:text-base tracking-tight text-foreground">
          {r.title}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {r.description}
        </p>

        {budget && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            الميزانية: {budget}
          </p>
        )}

        {r.customer?.name && (
          <p className="mt-2 text-xs text-muted-foreground">بواسطة {r.customer.name}</p>
        )}
      </Link>
    </li>
  );
}
