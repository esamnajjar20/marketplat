'use client';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { PageHeader } from '@/components/shared/layout/PageHeader';
import { ArrowRight } from 'lucide-react';

interface Props {
  backTo: string;
  backLabel: string;
  title: string;
}

/** Shared edit-page heading with a consistent, accessible return link. */
export function EditPageHeader({ backTo, backLabel, title }: Props) {
  return (
    <PageHeader
      variant="detail"
      title={title}
      className="mb-6"
      eyebrow={
        <IntentPrefetchLink
          href={backTo}
          prefetch={false}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-fast hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </IntentPrefetchLink>
      }
    />
  );
}
