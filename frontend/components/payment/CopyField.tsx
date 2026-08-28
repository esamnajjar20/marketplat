'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}

export function CopyField({ label, value, mono, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('تم النسخ');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('تعذّر النسخ — انسخ يدويًا');
    }
  }

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <span
          className={cn(
            'flex-1 break-all text-sm font-medium select-all',
            mono && 'font-mono tracking-wide',
          )}
          dir="ltr"
        >
          {value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleCopy}
          aria-label={`نسخ ${label}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
