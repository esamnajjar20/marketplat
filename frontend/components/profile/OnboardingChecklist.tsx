'use client';

import Link from 'next/link';
import { Check, Circle, User, Store, PlusCircle } from 'lucide-react';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useMyAds } from '@/hooks/queries/useAds';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * FIX P2-8: the dashboard had no onboarding guidance for a brand-new
 * user — just stats (all zero) + quick actions, with nothing tying
 * them together into "here's what to do first". Every step below
 * reads from data the dashboard is already fetching elsewhere
 * (useMySellerProfile is CreateAdGate's own check; useMyAds({limit:1})
 * is a cheap existence probe with its own query key — unrelated to
 * DashboardStats, which now reads from the separate useMyAdStats
 * aggregate endpoint, not from a list of ads) rather than inventing
 * new client-side "completeness" state.
 *
 * Collapses to nothing (returns null) once all steps are done, so it
 * doesn't linger as dead chrome for an established seller.
 */
export function OnboardingChecklist() {
  const user = useAuthStore(selectUser);
  const { data: sellerProfile, isLoading: sellerLoading, isError: sellerError } = useMySellerProfile();
  const { data: myAds, isLoading: adsLoading } = useMyAds({ limit: 1 });

  if (sellerLoading || adsLoading) return null;

  const hasAvatar = Boolean(user?.avatarUrl);
  // Mirrors CreateAdGate's own check: a 404 here means "not a seller
  // yet", not a failed fetch — treat isError the same way it does.
  const hasSellerProfile = !sellerError && Boolean(sellerProfile);
  const hasAd = Boolean(myAds?.items?.length);

  const steps = [
    {
      done: hasAvatar,
      label: 'أضف صورة شخصية',
      href: ROUTES.settings.profile,
      icon: User,
    },
    {
      done: hasSellerProfile,
      label: 'أنشئ ملف البائع',
      href: ROUTES.settings.seller,
      icon: Store,
    },
    {
      done: hasAd,
      // FIX P0-1's ?from= round trip already handles the case where
      // the user isn't a seller yet — this link works whether or not
      // hasSellerProfile is true.
      href: hasSellerProfile
        ? ROUTES.adCreate
        : `${ROUTES.settings.seller}?from=${encodeURIComponent(ROUTES.adCreate)}`,
      label: 'انشر إعلانك الأول',
      icon: PlusCircle,
    },
  ];

  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3" aria-labelledby="onboarding-heading">
      <div className="space-y-0.5">
        <h2 id="onboarding-heading" className="font-semibold text-sm">أكمل ملفك</h2>
        <p className="text-xs text-muted-foreground">
          {remaining.length} {remaining.length === 1 ? 'خطوة متبقية' : 'خطوات متبقية'}
        </p>
      </div>
      <ul className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.label}>
            {step.done ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span className="line-through">{step.label}</span>
              </div>
            ) : (
              <Link
                href={step.href}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  'hover:bg-muted',
                )}
              >
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <step.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
