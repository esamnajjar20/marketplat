'use client';

import Link from 'next/link';
import { MapPin, MessageSquare, Wallet, Clock } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_VARIANT, REQUEST_TYPE_LABEL, REQUEST_TYPE_VARIANT, formatRequestBudget, formatOffersCount, isRequestExpiringSoon } from '@/lib/requestStatus';
import type { RequestListItem } from '@/types/request.types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CardContext } from '@/components/shared/cards/cardParts';
// FIX REQCARD-RULES: CARD_PRESS للحصول على active:scale موحّد (Rule 12).
import { CARD_PRESS, CARD_SHELL } from '@/components/shared/cards/cardTokens';

type Props = { request: RequestListItem; context?: CardContext; showStatus?: boolean; className?: string; };

export function RequestCard({ request: r, context = 'public', showStatus = false, className }: Props) {
  const budget = formatRequestBudget(r.budgetMin, r.budgetMax);
  const offers = r._count?.offers;
  const expiringSoon = isRequestExpiringSoon(r.expiresAt);
  const showCity = context !== 'owner';
  const showTime = context !== 'related';

  return (
    <article className={cn('h-full w-full min-w-0', className)}>
      <Link href={ROUTES.request(r.id)} prefetch={false} className={cn(CARD_SHELL, 'flex flex-col p-3.5 transition-[box-shadow,border-color,transform] duration-200', 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', CARD_PRESS, expiringSoon && 'border-warning/40 bg-warning/[0.04]')}>
        {/* Rule 8: صفّان كحد أقصى. عند اجتماع "الحالة + ينتهي قريباً" يُسقط شارة النوع. */}
        <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-xs">
          {showStatus && <Badge size="xs" variant={REQUEST_STATUS_VARIANT[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>}
          {expiringSoon && <Badge size="xs" variant="outline" className="border-warning/50 bg-warning/10 text-warning-strong dark:text-warning"><Clock className="me-1 h-3 w-3" aria-hidden />ينتهي قريبًا</Badge>}
          {!(showStatus && expiringSoon) && <Badge size="xs" variant={REQUEST_TYPE_VARIANT[r.type]}>{REQUEST_TYPE_LABEL[r.type]}</Badge>}
        </div>
        <h2 className="mt-2.5 line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug tracking-tight text-foreground">{r.title}</h2>
        {r.description ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p> : <div className="min-h-4" />}
        <div className="mt-auto space-y-2 pt-3">
          <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-foreground tabular-nums"><Wallet className="h-3.5 w-3.5 text-primary" aria-hidden />{budget ?? 'ميزانية مفتوحة'}</span>
            {typeof offers === 'number' && <span className="inline-flex items-center gap-1 text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" aria-hidden />{formatOffersCount(offers)}</span>}
          </div>
          <div className="flex min-h-5 items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
            {showCity && r.city && <span className="flex min-w-0 items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{r.city}</span>}
            {showTime && r.createdAt && <span className="ms-auto shrink-0 whitespace-nowrap tabular-nums">{formatRelativeTime(r.createdAt)}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
