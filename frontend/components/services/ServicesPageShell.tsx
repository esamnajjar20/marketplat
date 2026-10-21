'use client';

import dynamic from 'next/dynamic';

const ServicesPageClient = dynamic(
  () => import('./ServicesPageClient').then((m) => ({ default: m.ServicesPageClient })),
  {
    ssr: false,
    loading: () => (
      <div className="container mx-auto max-w-7xl px-3 py-8 sm:px-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">جارٍ تحميل الخدمات…</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    ),
  },
);

export function ServicesPageShell() {
  return <ServicesPageClient />;
}
