'use client';

import Link from 'next/link';
import { Building2, User } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface StoreBrief {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl?: string | null;
}

interface Props {
  store?: StoreBrief | null;
  sellerName?: string | null;
  sellerUserId?: string | null;
  className?: string;
}

/**
 * شارة الناشر الظاهرة للزوّار: متجر أو حساب شخصي.
 */
export function AdPublisherBadge({ store, sellerName, sellerUserId, className }: Props) {
  if (store?.id) {
    const href = store.slug
      ? ROUTES.storeDetail?.(store.slug) ?? `/stores/${store.slug}`
      : `/stores/${store.id}`;
    return (
      <Link
        href={href}
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline',
          className
        )}
      >
        <Building2 className="h-3.5 w-3.5 text-primary" />
        <span>🏪 {store.name}</span>
        <span className="text-xs font-normal text-muted-foreground">إعلان من المتجر</span>
      </Link>
    );
  }

  if (sellerUserId || sellerName) {
    return (
      <Link
        href={sellerUserId ? ROUTES.userProfile(sellerUserId) : '#'}
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline',
          className
        )}
      >
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{sellerName ?? 'بائع'}</span>
        <span className="text-xs font-normal text-muted-foreground">إعلان شخصي</span>
      </Link>
    );
  }

  return null;
}
