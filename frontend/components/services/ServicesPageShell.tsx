'use client';
import dynamic from 'next/dynamic';
import { DevErrorBoundary } from '@/components/shared/DevErrorBoundary';

const ServicesPageClient = dynamic(
  () => import('./ServicesPageClient').then((m) => ({ default: m.ServicesPageClient })),
  { ssr: false, loading: () => <div className="container mx-auto max-w-7xl px-3 py-8"><p className="text-sm text-muted-foreground">جارٍ التحميل…</p></div> },
);

export function ServicesPageShell() {
  return <DevErrorBoundary label="ServicesPage"><ServicesPageClient /></DevErrorBoundary>;
}
