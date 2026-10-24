'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import { memo, Fragment } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { AdSignalsPanel } from './AdSignalsPanel';
import { cn } from '@/lib/utils';

type Ad = {
  id: string;
  title: string;
  price: number | string | null;
  riskScore: number;
  createdAt: string;
  user?: { name?: string } | null;
};

type Props = {
  ad: Ad;
  expanded: boolean;
  onToggleExpanded: (id: string) => void;
  onFlag: (id: string) => void;
  onClear: (id: string) => void;
  clearPending: boolean;
};

function riskBarColor(score: number): string {
  if (score >= 70) return '#B3261E';
  if (score >= 40) return '#C47A0A';
  return '#397F56';
}

/** Design-matched action button: height 30px, radius 8px */
function ActionBtn({
  children,
  onClick,
  variant = 'outline',
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'outline' | 'danger' | 'success';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] items-center justify-center gap-1 rounded-lg px-2.5 text-[12px] font-bold transition-colors disabled:opacity-50',
        variant === 'outline' && 'border border-[#CFE0D5] bg-white text-[#1F4D33] hover:bg-primary-soft',
        variant === 'danger' && 'border border-[#F1C9C4] bg-white text-[#9B2118] hover:bg-[#FBE9E7]',
        variant === 'success' && 'border border-[#CFE0D5] bg-white text-[#1F4D33] hover:bg-primary-soft',
      )}
    >
      {children}
    </button>
  );
}

export const AdminFraudRow = memo(function AdminFraudRow({
  ad,
  expanded,
  onToggleExpanded,
  onFlag,
  onClear,
  clearPending,
}: Props) {
  const score = ad.riskScore ?? 0;
  return (
    <Fragment>
      <tr className="border-b border-[#F0EADF] transition-colors hover:bg-[#F4F9F6] [content-visibility:auto] [contain-intrinsic-size:auto_56px]">
        <td className="p-3 max-w-xs">
          <Link
            prefetch={false}
            href={ROUTES.adDetail(ad.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[13px] font-bold hover:underline"
          >
            <ExternalLink className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">{ad.title}</span>
          </Link>
          <span className="text-[12px] text-[#6B6459]">
            {ad.price == null ? '—' : formatPrice(Number(ad.price))}
          </span>
        </td>
        <td className="p-3 hidden sm:table-cell text-[13px] text-[#4A433A]">
          {ad.user?.name ?? '—'}
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            <span className="relative h-2 w-16 overflow-hidden rounded-full bg-[#EAE3D6]">
              <i
                className="absolute inset-y-0 start-0 rounded-full"
                style={{ width: `${Math.min(100, score)}%`, background: riskBarColor(score) }}
              />
            </span>
            <span className="text-[13px] font-extrabold tabular-nums">{score}</span>
          </div>
        </td>
        <td className="p-3 hidden lg:table-cell text-[12px] text-[#6B6459]">
          <HydrationSafeRelativeTime date={ad.createdAt} />
        </td>
        <td className="p-3">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <ActionBtn onClick={() => onToggleExpanded(ad.id)} variant="outline">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              إشارات
            </ActionBtn>
            <ActionBtn onClick={() => onFlag(ad.id)} variant="danger">
              وسم
            </ActionBtn>
            <ActionBtn onClick={() => onClear(ad.id)} variant="success" disabled={clearPending}>
              سليم
            </ActionBtn>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#FBF9F4]">
          <td colSpan={5} className="p-0">
            <div className="border-b border-[#F0EADF] px-3.5 py-3">
              <AdSignalsPanel adId={ad.id} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
});
