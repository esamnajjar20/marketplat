'use client';

/**
 * مظهر الناشر فقط — بدون «إعلان من المتجر» / «إعلان شخصي».
 * متجر → اسم المتجر. وإلا → اسم البائع.
 */

import Link from 'next/link';
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
  plain?: boolean;
}

export function AdPublisherBadge({
  store,
  sellerName,
  sellerUserId,
  className,
  plain,
}: Props) {
  if (store?.id) {
    const href = `/stores/${store.slug || store.id}`;
    if (plain) {
      return <span className={cn('truncate', className)}>{store.name}</span>;
    }
    return (
      <Link
        href={href}
        className={cn('truncate font-medium hover:underline', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {store.name}
      </Link>
    );
  }

  if (sellerUserId || sellerName) {
    const text = sellerName ?? 'بائع';
    if (plain || !sellerUserId) {
      return <span className={cn('truncate', className)}>{text}</span>;
    }
    return (
      <Link
        href={ROUTES.userProfile(sellerUserId)}
        className={cn('truncate hover:underline', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </Link>
    );
  }

  return null;
}
