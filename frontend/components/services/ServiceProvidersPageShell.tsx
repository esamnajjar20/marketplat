'use client';
import dynamic from 'next/dynamic';
import { DevErrorBoundary } from '@/components/shared/DevErrorBoundary';
import { Skeleton } from '@/components/shared/ui/Skeleton';

const NearbyServiceProviders = dynamic(
  () => import('./NearbyServiceProviders').then((m) => ({ default: m.NearbyServiceProviders })),
  { ssr: false, loading: () => <Skeleton className="h-64 rounded-2xl" /> },
);

export function ServiceProvidersPageShell() {
  return <DevErrorBoundary label="ServiceProvidersPage"><NearbyServiceProviders /></DevErrorBoundary>;
}
