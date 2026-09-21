'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Store } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import type { ParsedError } from '@/lib/errorParser';

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Needed to tell a real "no profile" 404 apart from a network/offline
   *  failure — see FIX OFFLINE-GATE-404-01 below. Optional only so any
   *  pre-existing minimal query-like object still type-checks; every
   *  real useQuery result already has this. */
  error?: unknown;
  refetch?: () => void;
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
  // FIX GENERIC-ICON: this gate is shared by store, service-provider,
  // and seller profile setups, but the empty state always showed a
  // Store icon — misleading on the service-provider / seller pages.
  // Optional override; Store remains the default for callers that
  // don't care.
  icon?: ReactNode;
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
 *
 * FIX OFFLINE-GATE-404-01: this used to treat ANY query error the same
 * as "no profile" (`isError || !data`) — unlike MyStoreHub/MyServicesHub,
 * which already distinguish a real 404 from anything else. useMyStore/
 * useMyServiceProvider/useMySellerProfile each fall back to a cached
 * offline copy on a network failure (see their own comments), but that
 * fallback only has something to return once the user has successfully
 * loaded that profile at least once on this device. The first time any
 * of these queries ever runs is often right here — e.g. tapping "+" →
 * "منتج جديد" goes straight to this gate without visiting /my-store
 * first — so a user who already has a store/profile but is offline
 * with no warm cache yet was wrongly told to create one. Now only a
 * confirmed 404 (profile genuinely doesn't exist) shows the "create
 * it" CTA; any other error (network/offline, 5xx, etc.) shows a
 * distinct retry state instead, matching MyStoreHub's own handling.
 */
export function RequireProfileGate<T>({
  query, setupHref, from, title, description, ctaLabel, icon, children,
}: Props<T>) {
  const { data, isLoading, isError, error, refetch } = query;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const statusCode = (error as ParsedError | null)?.statusCode;

  if (isError && statusCode !== 404) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
        <p>تعذّر التحقق من ملفك الشخصي. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.</p>
        {refetch && (
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        )}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={icon ?? <Store className="h-8 w-8" />}
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
