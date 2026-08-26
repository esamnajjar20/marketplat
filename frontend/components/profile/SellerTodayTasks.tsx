'use client';

/**
 * Actionable "what needs attention" strip for the dashboard —
 * pending service requests, ads missing images, products out of stock.
 * Hides itself when there is nothing to do.
 */

import Link from 'next/link';
import {
  ClipboardList,
  ImageOff,
  PackageX,
  ArrowLeft,
  Wrench,
} from 'lucide-react';
import { useIncomingServiceRequests } from '@/hooks/queries/useServiceRequests';
import { useMyAds } from '@/hooks/queries/useAds';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useIsSeller } from '@/hooks/queries/useSellers';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

type Task = {
  id: string;
  label: string;
  count: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'warning' | 'primary' | 'muted';
};

export function SellerTodayTasks() {
  const { isProvider, isLoaded: providerLoaded } = useIsProvider();
  const { isSeller, isLoaded: sellerLoaded } = useIsSeller();

  const { data: incoming, isLoading: incomingLoading } = useIncomingServiceRequests(
    { status: 'PENDING', limit: 20 },
  );
  const { data: myAds, isLoading: adsLoading } = useMyAds({ limit: 50, status: 'ACTIVE' });
  const { data: myProducts, isLoading: productsLoading } = useMyProducts({ limit: 50 });

  if (!sellerLoaded || !providerLoaded) {
    return <div className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden />;
  }

  if (!isSeller && !isProvider) return null;

  const pendingRequests = (incoming?.items ?? []).filter((r) => r.status === 'PENDING').length;
  const adsMissingImages = (myAds?.items ?? []).filter(
    (ad) => !ad.images || ad.images.length === 0,
  ).length;
  const productsOut = (myProducts?.items ?? []).filter(
    (p) => p.availability === 'OUT_OF_STOCK',
  ).length;
  const productsNoImage = (myProducts?.items ?? []).filter(
    (p) => !p.images || p.images.length === 0,
  ).length;

  const tasks: Task[] = [];

  if (isProvider && pendingRequests > 0) {
    tasks.push({
      id: 'requests',
      label: 'طلبات خدمة بانتظار ردك',
      count: pendingRequests,
      href: ROUTES.incomingServiceRequests,
      icon: ClipboardList,
      tone: 'warning',
    });
  }
  if (isSeller && adsMissingImages > 0) {
    tasks.push({
      id: 'ads-img',
      label: 'إعلانات بدون صور',
      count: adsMissingImages,
      href: ROUTES.myAds,
      icon: ImageOff,
      tone: 'muted',
    });
  }
  if (isSeller && productsOut > 0) {
    tasks.push({
      id: 'oos',
      label: 'منتجات غير متوفرة',
      count: productsOut,
      href: ROUTES.myStoreProducts,
      icon: PackageX,
      tone: 'warning',
    });
  }
  if (isSeller && productsNoImage > 0) {
    tasks.push({
      id: 'prod-img',
      label: 'منتجات بدون صور',
      count: productsNoImage,
      href: ROUTES.myStoreProducts,
      icon: ImageOff,
      tone: 'muted',
    });
  }
  if (isProvider && pendingRequests === 0 && !incomingLoading) {
    // optional soft nudge — skip if we want only problems
  }

  const loading = incomingLoading || adsLoading || productsLoading;
  if (loading && tasks.length === 0) {
    return <div className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden />;
  }
  if (tasks.length === 0) return null;

  return (
    <section
      aria-label="مهام تحتاج انتباهك"
      className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
          يحتاج انتباهك
        </h2>
        <span className="text-xs text-muted-foreground">{tasks.length} بند</span>
      </div>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={task.href}
              className={cn(
                'flex min-h-[48px] items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50',
              )}
            >
              <task.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="flex-1 text-start text-sm font-medium">{task.label}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-primary">
                {task.count}
              </span>
              <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
