import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ServicesPageClient } from '@/components/services/ServicesPageClient';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'الخدمات', path: '/services' });

function ServicesPageFallback() {
  return (
    <div className="container mx-auto max-w-7xl px-3 py-8 sm:px-4" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">جارٍ تحميل الخدمات…</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<ServicesPageFallback />}>
      <ServicesPageClient />
    </Suspense>
  );
}
