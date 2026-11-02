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
  if (score >= 70) return 'var(--legacy-danger-strong)';
  if (score >= 40) return 'var(--legacy-warning-strong)';
  return 'var(--legacy-primary)';
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
        variant === 'outline' && 'border border-[var(--legacy-primary-border)] bg-card text-[var(--legacy-primary-deep)] hover:bg-primary-soft',
        variant === 'danger' && 'border border-[var(--legacy-danger-border)] bg-card text-[var(--legacy-danger)] hover:bg-[var(--legacy-danger-soft)]',
        variant === 'success' && 'border border-[var(--legacy-primary-border)] bg-card text-[var(--legacy-primary-deep)] hover:bg-primary-soft',
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
      <tr className="border-b border-[var(--legacy-muted-surface)] transition-colors hover:bg-[var(--legacy-card-soft)] [content-visibility:auto] [contain-intrinsic-size:auto_56px]">
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
          <span className="text-[12px] text-[var(--legacy-muted-text)]">
            {ad.price == null ? '—' : formatPrice(Number(ad.price))}
          </span>
        </td>
        <td className="p-3 hidden sm:table-cell text-[13px] text-[var(--legacy-foreground-warm)]">
          {ad.user?.name ?? '—'}
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            <span className="relative h-2 w-16 overflow-hidden rounded-full bg-[var(--legacy-border)]">
              <i
                className="absolute inset-y-0 start-0 rounded-full"
                style={{ width: `${Math.min(100, score)}%`, background: riskBarColor(score) }}
              />
            </span>
            <span className="text-[13px] font-extrabold tabular-nums">{score}</span>
          </div>
        </td>
        <td className="p-3 hidden lg:table-cell text-[12px] text-[var(--legacy-muted-text)]">
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
        <tr className="bg-[var(--legacy-page-surface)]">
          <td colSpan={5} className="p-0">
            <div className="border-b border-[var(--legacy-muted-surface)] px-3.5 py-3">
              <AdSignalsPanel adId={ad.id} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
});
