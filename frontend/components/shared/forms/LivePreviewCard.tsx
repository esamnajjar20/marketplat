'use client';

/**
 * DESKTOP-AUDIT-05: shared shell for the three create-form live
 * previews. AdFormPreview was the only one of the three that existed
 * before this — ProductFormPreview/ServiceListingFormPreview are new,
 * and rather than each redefining the same label/border/rounded/
 * shadow/caption markup AdFormPreview already had, all three now wrap
 * their entity-specific media + body content in this one shell.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Image area, including any overlay badges — rendered above the body. */
  media: ReactNode;
  /** Body content: price, title, meta lines. */
  children: ReactNode;
  /** Footer note explaining what this preview approximates. */
  caption: string;
  className?: string;
}

export function LivePreviewCard({ media, children, caption, className }: Props) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-muted-foreground">
        معاينة البطاقة
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {media}
        <div className="space-y-1 p-3">{children}</div>
      </div>
      <p className="text-2xs-tight text-muted-foreground">{caption}</p>
    </div>
  );
}
