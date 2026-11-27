import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/layout/PageHeader';

/** Shared chrome for protected account surfaces (messages, notifications, favorites, settings). */
export function AccountPageShell({
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
    <div className={cn('pb-0', className)}>
      <div className="page-header-frame page-header-frame--account">
        <div className="page-container">
          <PageHeader
            variant="account"
            title={title}
            description={description}
            actions={actions}
          />
        </div>
      </div>
      <div className="page-container page-content-stack page-content-stack--account">
        {children}
      </div>
    </div>
  );
}
