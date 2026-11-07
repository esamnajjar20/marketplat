'use client';

import { throwIfQueryCancelled } from '@/lib/queryCancellation';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOfflineListSeed } from '@/lib/useOfflineListSeed';
import type { ApiResponse } from '@/types/api.types';
import type { SellerRankingRow } from '@/types/seller-ranking.types';
import { normalizeSellerRankingRows } from '@/lib/sellerRanking';
import { queryKeys } from '@/lib/queryKeys';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { ROUTES } from '@/lib/constants';
import { ResponseTimeBadge } from '@/components/sellers/ResponseTimeBadge';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';
import { Info, Star, RefreshCw, X, Shield, Zap, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

type RankRow = SellerRankingRow;

function initialLetter(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0) : '?';
}

function RankingInfoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const items = [
    { title: 'التقييم', desc: 'متوسط تقييمات المشترين وعددها.', icon: Star },
    { title: 'الثقة', desc: 'توثيق الحساب وسلامة السجل.', icon: Shield },
    { title: 'سرعة الرد', desc: 'متوسط زمن الرد ومعدل الرد على الرسائل.', icon: Zap },
    { title: 'نشاط الحساب', desc: 'انتظام النشر والتفاعل مع المشترين.', icon: Users },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ranking-info-title">
      <button type="button" className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" aria-label="إغلاق" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-[20px] bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-[20px] sm:p-5">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 id="ranking-info-title" className="text-[17px] font-extrabold text-foreground">كيف يُحسب الترتيب؟</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
              الترتيب يعتمد على التقييم، الثقة، سرعة الرد، ونشاط الحساب — وليس عدد الإعلانات فقط.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {items.map(({ title, desc, icon: Icon }) => (
            <li key={title} className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-foreground">{title}</p>
                <p className="text-[12px] text-muted-foreground">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RankingSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-3 py-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted/70" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function Podium({ top3 }: { top3: RankRow[] }) {
  // Visual order: 2nd | 1st | 3rd
  const first = top3.find((r) => r.rank === 1);
  const second = top3.find((r) => r.rank === 2);
  const third = top3.find((r) => r.rank === 3);
  const slots = [
    { row: third, place: 3, ring: 'border-accent/30 bg-accent/10', badge: 'bg-accent text-accent-foreground' },
    { row: first, place: 1, ring: 'border-amber-500/35 bg-amber-500/10', badge: 'bg-warning text-warning-foreground' },
    { row: second, place: 2, ring: 'border-[var(--legacy-border-strong)] bg-muted/70', badge: 'bg-muted text-muted-foreground' },
  ] as const;

  return (
    <div className="mb-4 grid grid-cols-3 items-end gap-2">
      {slots.map(({ row, place, ring, badge }) => {
        if (!row) {
          return <div key={place} className="min-h-[120px]" />;
        }
        const isFirst = place === 1;
        return (
          <IntentPrefetchLink
            key={row.sellerProfileId}
            href={ROUTES.userProfile(row.userId)}
            className={cn(
              'relative flex flex-col items-center rounded-[16px] border-2 px-2 pb-3 pt-5 text-center transition-transform hover:-translate-y-0.5',
              ring,
              isFirst ? 'min-h-[160px]' : 'min-h-[140px]',
            )} prefetch={false}
          >
            <span className={cn('absolute -top-3 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold', badge)}>
              {place}
            </span>
            <span
              className={cn(
                'flex items-center justify-center rounded-full bg-background font-extrabold text-primary shadow-sm',
                isFirst ? 'h-14 w-14 text-xl' : 'h-12 w-12 text-lg',
              )}
            >
              {initialLetter(row.displayName)}
            </span>
            <p className={cn('mt-2 line-clamp-2 font-extrabold leading-tight text-foreground', isFirst ? 'text-[14px]' : 'text-[13px]')}>
              {row.displayName}
            </p>
            {row.verified && (
              <span className="mt-1 inline-flex h-[20px] items-center rounded-full bg-primary/10 px-2 text-[11px] font-bold text-primary">
                موثّق
              </span>
            )}
            <p className="mt-1 text-[12px] font-bold text-muted-foreground">نقاط {row.score}</p>
          </IntentPrefetchLink>
        );
      })}
    </div>
  );
}

export function SellersRankingList({
  limit = 20,
  persistServerSeed = false,
}: {
  limit?: number;
  persistServerSeed?: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const queryKey = queryKeys.sellers.ranking(limit);
  useOfflineListSeed<RankRow, RankRow[]>({
    queryKey,
    cacheKey: OFFLINE_LIST_KEYS.sellersRanking,
    mapItems: (items) => items,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch(`/api/v1/sellers/ranking?limit=${limit}`, {
          signal,
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Seller ranking request failed (${response.status})`);
        const payload = (await response.json()) as ApiResponse<RankRow[]>;
        const rows = normalizeSellerRankingRows(payload.data ?? []);
        saveOfflineList(OFFLINE_LIST_KEYS.sellersRanking, rows, OFFLINE_LIST_LIMITS.sellersRanking);
        return rows;
      } catch (err) {
        throwIfQueryCancelled(err, signal);
        const local = getOfflineList<RankRow>(OFFLINE_LIST_KEYS.sellersRanking);
        if (local?.items.length) return local.items.map((row) => ({ ...row, displayName: row.displayName?.trim() || `بائع ${row.rank}` }));
        throw err;
      }
    },
    staleTime: 30_000,
  });

  // Persist only a page payload explicitly prefetched from the server. The
  // offline seed hook also fills this query after hydration, but must not
  // refresh the savedAt timestamp of an old snapshot.
  useEffect(() => {
    if (!persistServerSeed || data === undefined) return;
    saveOfflineList(OFFLINE_LIST_KEYS.sellersRanking, data, OFFLINE_LIST_LIMITS.sellersRanking);
  }, [data, persistServerSeed]);

  const rows = data ?? [];
  const top3 = rows.filter((r) => r.rank <= 3).slice(0, 3);
  const rest = rows.filter((r) => r.rank > 3);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">أفضل البائعين</h1>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            الترتيب يعتمد على التقييم، الثقة، سرعة الرد، ونشاط الحساب — وليس عدد الإعلانات فقط.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
          aria-label="كيف يُحسب الترتيب؟"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {isLoading && <RankingSkeleton />}

      {isError && data !== undefined && (
        <p role="status" className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          تعذّر تحديث الترتيب؛ نعرض آخر نسخة متاحة.
        </p>
      )}

      {isError && data === undefined && (
        <div className="rounded-[14px] border border-[var(--legacy-danger-border)] bg-card px-4 py-4 text-center">
          <p className="text-[14px] font-bold text-destructive">تعذّر تحميل الترتيب.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[13px] font-bold text-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {!isLoading && !isError && data !== undefined && rows.length === 0 && (
        <div className="rounded-[14px] border border-border bg-card px-4 py-8 text-center">
          <p className="text-[14px] text-muted-foreground">لا يوجد بائعون بعد.</p>
        </div>
      )}

      {!isLoading && data !== undefined && rows.length > 0 && (
        <>
          {top3.length > 0 && <Podium top3={top3} />}
          <ol className="space-y-2" aria-label="ترتيب أفضل البائعين">
            {rest.map((r) => (
              <li key={r.sellerProfileId}>
                <IntentPrefetchLink
                  href={ROUTES.userProfile(r.userId)}
                  className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-3 py-3 shadow-[0_1px_3px_rgba(42,36,29,0.04)] transition-colors hover:bg-muted/60" prefetch={false}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[14px] font-extrabold text-foreground">{r.displayName}</span>
                      {r.verified && (
                        <span className="inline-flex h-[20px] items-center rounded-full bg-primary/10 px-1.5 text-[11px] font-bold text-primary">
                          موثّق
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                      <span className="inline-flex items-center gap-0.5 font-bold text-foreground">
                        <Star className="h-3 w-3 fill-[var(--legacy-warning-strong)] text-[var(--legacy-warning-strong)]" />
                        {r.averageRating.toFixed(1)}
                        <span className="font-normal text-muted-foreground">({r.totalRatings})</span>
                      </span>
                      <ResponseTimeBadge responseTimeMinutes={r.responseTimeMinutes} size="sm" />
                    </div>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[15px] font-extrabold text-primary">
                    {initialLetter(r.displayName)}
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/70 text-[12px] font-extrabold text-foreground">
                    {r.rank}
                  </span>
                  <div className="shrink-0 text-end">
                    <p className="text-[11px] text-muted-foreground">نقاط</p>
                    <p className="text-[15px] font-extrabold tabular-nums text-foreground">{r.score}</p>
                  </div>
                </IntentPrefetchLink>
              </li>
            ))}
          </ol>
        </>
      )}

      <RankingInfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
