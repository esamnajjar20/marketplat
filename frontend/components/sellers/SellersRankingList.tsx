'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOfflineListSeed } from '@/lib/useOfflineListSeed';
import type { ApiResponse } from '@/types/api.types';
import Link from 'next/link';
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

interface RankRow {
  rank: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  sellerProfileId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  verified: boolean;
  averageRating: number;
  totalRatings: number;
  responseTimeMinutes: number | null;
  score: number;
}

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
            <p className="mt-1 text-[13px] leading-5 text-[#6B6459]">
              الترتيب يعتمد على التقييم، الثقة، سرعة الرد، ونشاط الحساب — وليس عدد الإعلانات فقط.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EAE3D6] bg-card text-[#4A433A]"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {items.map(({ title, desc, icon: Icon }) => (
            <li key={title} className="flex items-center gap-3 rounded-[14px] border border-[#EAE3D6] bg-card px-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EC] text-primary">
                <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-foreground">{title}</p>
                <p className="text-[12px] text-[#6B6459]">{desc}</p>
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
        <div key={i} className="flex items-center gap-3 rounded-[14px] border border-[#EAE3D6] bg-card px-3 py-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-[#EAE3D6]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-[#EAE3D6]" />
            <div className="h-2.5 w-3/5 animate-pulse rounded bg-[#F0EADF]" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-full bg-[#EAE3D6]" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-[#F0EADF]" />
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
    { row: third, place: 3, ring: 'border-[#F1C9C4] bg-[#FBE9E7]', badge: 'bg-[#B3261E] text-white' },
    { row: first, place: 1, ring: 'border-[#E8C96A] bg-[#FBF0D9]', badge: 'bg-[#C47A0A] text-white' },
    { row: second, place: 2, ring: 'border-[#D9D1C3] bg-[#F0EADF]', badge: 'bg-[#6B6459] text-white' },
  ] as const;

  return (
    <div className="mb-4 grid grid-cols-3 items-end gap-2">
      {slots.map(({ row, place, ring, badge }) => {
        if (!row) {
          return <div key={place} className="min-h-[120px]" />;
        }
        const isFirst = place === 1;
        return (
          <Link
            key={row.sellerProfileId}
            href={ROUTES.userProfile(row.userId)}
            className={cn(
              'relative flex flex-col items-center rounded-[16px] border-2 px-2 pb-3 pt-5 text-center transition-transform hover:-translate-y-0.5',
              ring,
              isFirst ? 'min-h-[160px]' : 'min-h-[140px]',
            )}
          >
            <span className={cn('absolute -top-3 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold', badge)}>
              {place}
            </span>
            <span
              className={cn(
                'flex items-center justify-center rounded-full bg-white font-extrabold text-primary shadow-sm',
                isFirst ? 'h-14 w-14 text-xl' : 'h-12 w-12 text-lg',
              )}
            >
              {initialLetter(row.displayName)}
            </span>
            <p className={cn('mt-2 line-clamp-2 font-extrabold leading-tight text-foreground', isFirst ? 'text-[14px]' : 'text-[13px]')}>
              {row.displayName}
            </p>
            {row.verified && (
              <span className="mt-1 inline-flex h-[20px] items-center rounded-full bg-[#E8F1EC] px-2 text-[11px] font-bold text-[#1F4D33]">
                موثّق
              </span>
            )}
            <p className="mt-1 text-[12px] font-bold text-[#6B6459]">نقاط {row.score}</p>
          </Link>
        );
      })}
    </div>
  );
}

export function SellersRankingList({ limit = 20 }: { limit?: number }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const queryKey = ['sellers', 'ranking', limit] as const;
  useOfflineListSeed<RankRow, RankRow[]>({
    queryKey,
    cacheKey: OFFLINE_LIST_KEYS.sellersRanking,
    mapItems: (items) => items,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const response = await fetch(`/api/v1/sellers/ranking?limit=${limit}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Seller ranking request failed (${response.status})`);
        const payload = (await response.json()) as ApiResponse<RankRow[]>;
        const rows = payload.data ?? [];
        saveOfflineList(OFFLINE_LIST_KEYS.sellersRanking, rows, OFFLINE_LIST_LIMITS.sellersRanking);
        return rows;
      } catch (err) {
        const local = getOfflineList<RankRow>(OFFLINE_LIST_KEYS.sellersRanking);
        if (local?.items.length) return local.items;
        throw err;
      }
    },
  });

  const rows = data ?? [];
  const top3 = rows.filter((r) => r.rank <= 3).slice(0, 3);
  const rest = rows.filter((r) => r.rank > 3);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">أفضل البائعين</h1>
          <p className="mt-0.5 text-[13px] leading-5 text-[#6B6459]">
            الترتيب يعتمد على التقييم، الثقة، سرعة الرد، ونشاط الحساب — وليس عدد الإعلانات فقط.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EAE3D6] bg-card text-[#4A433A]"
          aria-label="كيف يُحسب الترتيب؟"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {isLoading && <RankingSkeleton />}

      {isError && (
        <div className="rounded-[14px] border border-[#F1C9C4] bg-card px-4 py-4 text-center">
          <p className="text-[14px] font-bold text-[#9B2118]">تعذّر تحميل الترتيب.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#CFE0D5] bg-white px-3 text-[13px] font-bold text-[#1F4D33]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-[14px] border border-[#EAE3D6] bg-card px-4 py-8 text-center">
          <p className="text-[14px] text-[#6B6459]">لا يوجد بائعون بعد.</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          {top3.length > 0 && <Podium top3={top3} />}
          <ol className="space-y-2" aria-label="ترتيب أفضل البائعين">
            {rest.map((r) => (
              <li key={r.sellerProfileId}>
                <Link
                  href={ROUTES.userProfile(r.userId)}
                  className="flex items-center gap-3 rounded-[14px] border border-[#EAE3D6] bg-card px-3 py-3 shadow-[0_1px_3px_rgba(42,36,29,0.04)] transition-colors hover:bg-[#FBF9F4]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[14px] font-extrabold text-foreground">{r.displayName}</span>
                      {r.verified && (
                        <span className="inline-flex h-[20px] items-center rounded-full bg-[#E8F1EC] px-1.5 text-[11px] font-bold text-[#1F4D33]">
                          موثّق
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[#6B6459]">
                      <span className="inline-flex items-center gap-0.5 font-bold text-foreground">
                        <Star className="h-3 w-3 fill-[#C47A0A] text-[#C47A0A]" />
                        {r.averageRating.toFixed(1)}
                        <span className="font-normal text-[#6B6459]">({r.totalRatings})</span>
                      </span>
                      <ResponseTimeBadge responseTimeMinutes={r.responseTimeMinutes} size="sm" />
                    </div>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8F1EC] text-[15px] font-extrabold text-primary">
                    {initialLetter(r.displayName)}
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0EADF] text-[12px] font-extrabold text-[#4A433A]">
                    {r.rank}
                  </span>
                  <div className="shrink-0 text-end">
                    <p className="text-[11px] text-[#6B6459]">نقاط</p>
                    <p className="text-[15px] font-extrabold tabular-nums text-foreground">{r.score}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}

      <RankingInfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
