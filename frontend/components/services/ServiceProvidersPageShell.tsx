'use client';

import dynamic from 'next/dynamic';

const NearbyServiceProviders = dynamic(
  () => import('./NearbyServiceProviders').then((m) => ({ default: m.NearbyServiceProviders })),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-2xl bg-muted" role="status" aria-label="جارٍ تحميل مقدمي الخدمة" />
    ),
  },
);

export function ServiceProvidersPageShell() {
  return <NearbyServiceProviders />;
}
