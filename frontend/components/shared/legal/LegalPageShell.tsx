import type { ReactNode } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

const LEGAL_NAV = [
  { href: ROUTES.about, label: 'من نحن' },
  { href: ROUTES.contact, label: 'تواصل معنا' },
  { href: ROUTES.privacy, label: 'الخصوصية' },
  { href: ROUTES.terms, label: 'الشروط' },
] as const;

/**
 * Shared shell for public legal / about pages —
 * calm reading layout with secondary nav between sibling pages.
 */
export function LegalPageShell({ title, description, children, className }: Props) {
  return (
    <div className={cn('container mx-auto max-w-3xl space-y-8 px-4 py-10 sm:py-14', className)}>
      <header className="space-y-3 border-b border-border/70 pb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-primary-muted">سوق غزة</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p>
        )}
        <nav aria-label="صفحات المعلومات" className="flex flex-wrap gap-2 pt-2">
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="prose-legal space-y-5 text-[15px] leading-7 text-foreground/90 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-5 [&_ul]:text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline">
        {children}
      </div>
    </div>
  );
}
