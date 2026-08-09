'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Store } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

interface Props<T> {
  /** Query hook result for "does the user already have this profile?" —
   *  useMyStore(), useMyServiceProvider(), useMySellerProfile(), etc.
   *  Convention shared by all three: isError with no data means
   *  "no profile yet", not a real error — see each hook's own comment. */
  query: QueryLike<T>;
  /** Where the setup form itself lives, e.g. ROUTES.settings.store. */
  setupHref: string;
  /** Absolute path of the page the user was trying to reach — carried
   *  through as ?from= so the setup form can send them back here on
   *  success. Pass the current page's own path. */
  from: string;
  title: string;
  description: string;
  ctaLabel: string;
  children: ReactNode;
}

/**
 * Unified "does the user have the profile this page needs?" gate —
 * generalizes CreateAdGate's seller-profile check to also cover store
 * ownership and service-provider registration, so all three follow one
 * shape instead of three:
 *
 *   original intent → Gate → profile setup → profile created → back to `from`
 *
 * Previously only ad creation had this: /my-store/products/new and
 * /my-services/new mounted their forms directly with no client-side
 * check, so a user without a store/service-provider profile only found
 * out on submit (a backend 4xx), and even then had no return path back
 * to the product/service form after fixing it via settings.
 *
 * Each setup page (BecomeStoreOwnerCard, BecomeServiceProviderCard,
 * BecomeSellerCard) is responsible for reading ?from= via
 * useSearchParams() and redirecting on its own mutation's onSuccess —
 * this component only builds the link that carries the intent there.
 * See BecomeSellerCard for the reference implementation.
 */
export function RequireProfileGate<T>({
  query, setupHref, from, title, description, ctaLabel, children,
}: Props<T>) {
  const { data, isLoading, isError } = query;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={<Store className="h-8 w-8" />}
        title={title}
        description={description}
        action={
          <Button asChild>
            <Link href={`${setupHref}?from=${encodeURIComponent(from)}`}>{ctaLabel}</Link>
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}
