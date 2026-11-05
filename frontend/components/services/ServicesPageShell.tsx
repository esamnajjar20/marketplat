'use client';
import dynamic from 'next/dynamic';
import { DevErrorBoundary } from '@/components/shared/DevErrorBoundary';
import type { BrowsePage } from '@/types/browse.types';
import type { ServiceListingWithProvider } from '@/types/service.types';
import type { BrowseSearchParams } from '@/lib/browseSearchParams';

const ServicesPageClient = dynamic(
  () => import('./ServicesPageClient').then((m) => ({ default: m.ServicesPageClient })),
  { loading: () => <div className="container mx-auto max-w-7xl px-3 py-8"><p className="text-sm text-muted-foreground">جارٍ التحميل…</p></div> },
);

interface ServicesPageShellProps {
  initialPage?: BrowsePage<ServiceListingWithProvider> | null;
  initialPageUpdatedAt?: number;
  searchParams?: BrowseSearchParams;
}

export function ServicesPageShell({ initialPage, initialPageUpdatedAt, searchParams }: ServicesPageShellProps = {}) {
  return (
    <DevErrorBoundary label="ServicesPage">
      <ServicesPageClient initialPage={initialPage} initialPageUpdatedAt={initialPageUpdatedAt} searchParams={searchParams} />
    </DevErrorBoundary>
  );
}
