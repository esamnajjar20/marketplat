import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/layout/PageHeader';

/** Shared chrome for admin table/dashboard pages. */
export function AdminPageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('page-content-stack page-content-stack--admin mx-auto w-full max-w-[1600px]', className)}>
      <PageHeader variant="admin" title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}
