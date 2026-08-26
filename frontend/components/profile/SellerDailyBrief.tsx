'use client';

/**
 * Compact "today at a glance" strip on the dashboard — views, favorites,
 * active ads from existing /ads/me/stats plus unread message threads.
 */

import Link from 'next/link';
import { Eye, Heart, MessageSquare, ShoppingBag } from 'lucide-react';
import { useMyAdStats } from '@/hooks/queries/useAds';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { formatNumber } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';

export function SellerDailyBrief() {
  const { data: stats, isLoading: statsLoading, isError: statsError } = useMyAdStats();
  const { data: convData, isLoading: convLoading } = useMyConversations({ limit: 20 });

  const items = convData?.items ?? [];
  const unreadThreads = items.filter((c) => (c.unreadCount ?? 0) > 0).length;

  if (statsLoading || convLoading) {
    return (
      <div className="h-16 animate-pulse rounded-xl bg-muted" aria-hidden />
    );
  }

  if (statsError && !stats) return null;

  const chips = [
    {
      label: 'إعلانات نشطة',
      value: stats?.activeAds ?? 0,
      icon: ShoppingBag,
      href: ROUTES.myAds,
    },
    {
      label: 'مشاهدات',
      value: stats?.totalViews ?? 0,
      icon: Eye,
      href: ROUTES.myAds,
    },
    {
      label: 'في المفضلة',
      value: stats?.favoritesCount ?? 0,
      icon: Heart,
      href: ROUTES.favorites,
    },
    {
      label: 'محادثات غير مقروءة',
      value: unreadThreads,
      icon: MessageSquare,
      href: ROUTES.messages,
      highlight: unreadThreads > 0,
    },
  ];

  return (
    <section
      aria-label="ملخص سريع"
      className="rounded-xl border border-primary/15 bg-primary/5 p-3 sm:p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">ملخص سريع</h2>
        <Link href={ROUTES.messages} className="text-xs font-medium text-primary hover:underline">
          الرسائل
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chips.map(({ label, value, icon: Icon, href, highlight }) => (
          <Link
            key={label}
            href={href}
            className={
              highlight
                ? 'flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-2.5 py-2 transition-colors hover:bg-primary/5'
                : 'flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:bg-muted/50'
            }
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold tabular-nums leading-none">
                {formatNumber(value)}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{label}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
