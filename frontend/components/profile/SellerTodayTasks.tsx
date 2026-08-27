'use client';

/**
 * Actionable "what needs attention" strip — backed by
 * GET /sellers/me/attention (server-side counts).
 */

import Link from 'next/link';
import {
  ClipboardList,
  ImageOff,
  PackageX,
  ArrowLeft,
  Wrench,
} from 'lucide-react';
import { useMyAttention, useIsSeller } from '@/hooks/queries/useSellers';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

type Task = {
  id: string;
  label: string;
  count: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function SellerTodayTasks() {
  const { isSeller, isLoaded: sellerLoaded } = useIsSeller();
  const { isProvider, isLoaded: providerLoaded } = useIsProvider();
  const { data: attention, isLoading, isError, refetch } = useMyAttention();

  if (!sellerLoaded || !providerLoaded) {
    return <div className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden />;
  }

  if (!isSeller && !isProvider) return null;

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden />;
  }

  if (isError || !attention) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-center text-sm">
        <p className="text-muted-foreground">تعذّر تحميل المهام</p>
        <button type="button" onClick={() => refetch()} className="mt-1 text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const tasks: Task[] = [];

  if (attention.isProvider && attention.pendingServiceRequests > 0) {
    tasks.push({
      id: 'requests',
      label: 'طلبات خدمة بانتظار ردك',
      count: attention.pendingServiceRequests,
      href: ROUTES.incomingServiceRequests,
      icon: ClipboardList,
    });
  }
  if (isSeller && attention.adsMissingImages > 0) {
    tasks.push({
      id: 'ads-img',
      label: 'إعلانات بدون صور',
      count: attention.adsMissingImages,
      href: ROUTES.myAds,
      icon: ImageOff,
    });
  }
  if (attention.hasStore && attention.productsOutOfStock > 0) {
    tasks.push({
      id: 'oos',
      label: 'منتجات غير متوفرة',
      count: attention.productsOutOfStock,
      href: ROUTES.myStoreProducts,
      icon: PackageX,
    });
  }
  if (attention.hasStore && attention.productsMissingImages > 0) {
    tasks.push({
      id: 'prod-img',
      label: 'منتجات بدون صور',
      count: attention.productsMissingImages,
      href: ROUTES.myStoreProducts,
      icon: ImageOff,
    });
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
