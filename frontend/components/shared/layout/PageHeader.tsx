import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PageHeaderVariant = 'standard' | 'browse' | 'account' | 'admin' | 'detail';

export interface PageHeaderProps {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Controls density and surface treatment without duplicating header markup. */
  variant?: PageHeaderVariant;
  /** Optional stable heading ID for landmarks that reference the title. */
  titleId?: string;
  className?: string;
}

/**
 * Canonical page heading for Web. Public browse, account, admin and detail
 * pages share one semantic structure; variants only change visual density.
 * Platform-specific navigation (e.g. the Native AppHeader) remains separate.
 */
export function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  variant = 'standard',
  titleId,
  className,
}: PageHeaderProps) {
  return (
    <header
      data-page-header
      data-variant={variant}
      className={cn('page-header', `page-header--${variant}`, className)}
    >
      <div className="page-header__main">
        {icon ? <div className="page-header__icon" aria-hidden="true">{icon}</div> : null}
        <div className="page-header__copy">
          {eyebrow ? <div className="page-header__eyebrow">{eyebrow}</div> : null}
          <h1 id={titleId} className="page-header__title">{title}</h1>
          {description ? <p className="page-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
