'use client';
import dynamic from 'next/dynamic';
import { DevErrorBoundary } from '@/components/shared/DevErrorBoundary';

const NearbyServiceProviders = dynamic(
  () => import('./NearbyServiceProviders').then((m) => ({ default: m.NearbyServiceProviders })),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl bg-muted" /> },
);

export function ServiceProvidersPageShell() {
  return <DevErrorBoundary label="ServiceProvidersPage"><NearbyServiceProviders /></DevErrorBoundary>;
}
