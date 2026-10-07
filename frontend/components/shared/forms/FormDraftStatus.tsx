'use client';

import { Check, CloudOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  savedAt: number | null;
  saving?: boolean;
  enabled?: boolean;
  className?: string;
}

export function FormDraftStatus({ savedAt, saving = false, enabled = true, className }: Props) {
  if (!enabled) return null;

  const label = saving
    ? 'جارٍ حفظ المسودة…'
    : savedAt
      ? `محفوظة تلقائيًا · ${new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(savedAt)}`
      : 'سيتم حفظ المسودة تلقائيًا';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-xs',
        saving
          ? 'border-primary/20 bg-primary/5 text-primary'
          : savedAt
            ? 'border-success/20 bg-success/5 text-success'
            : 'border-border bg-muted/30 text-muted-foreground',
        className,
      )}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : savedAt ? <Check className="h-3.5 w-3.5" aria-hidden /> : <CloudOff className="h-3.5 w-3.5" aria-hidden />}
      <span>{label}</span>
    </div>
  );
}
