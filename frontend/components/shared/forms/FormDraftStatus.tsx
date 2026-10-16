'use client';

import { Check, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Spinner } from '@/components/ui/spinner';
const DRAFT_TIME_FORMATTER = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }) : null;

interface Props {
  savedAt: number | null;
  saving?: boolean;
  enabled?: boolean;
  saveError?: string | null;
  onRetry?: () => void;
  className?: string;
}

export function FormDraftStatus({
  savedAt,
  saving = false,
  enabled = true,
  saveError = null,
  onRetry,
  className,
}: Props) {
  if (!enabled) return null;

  const label = saveError
    ? saveError
    : saving
      ? 'جارٍ حفظ المسودة…'
      : savedAt
        ? `محفوظة تلقائيًا · ${DRAFT_TIME_FORMATTER?.format(savedAt) ?? ''}`
        : 'سيتم حفظ المسودة تلقائيًا';

  const statusClass = saveError
    ? 'border-destructive/30 bg-destructive/5 text-destructive'
    : saving
      ? 'border-primary/20 bg-primary/5 text-primary'
      : savedAt
        ? 'border-success/20 bg-success/5 text-success'
        : 'border-border bg-muted/30 text-muted-foreground';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-xs',
        statusClass,
        className,
      )}
    >
      {saving && !saveError ? (
        <Spinner size="xs" />
      ) : saveError ? (
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
      ) : savedAt ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="min-w-0 flex-1">{label}</span>
      {saveError && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-current/30 px-2 py-1 font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          إعادة حفظ الصور
        </button>
      ) : null}
    </div>
  );
}
