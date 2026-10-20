import type { Metadata } from 'next';
import { StoresPageClient } from '@/components/stores/StoresPageClient';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'المتاجر', path: '/stores' });

export default function StoresPage() {
  return <StoresPageClient />;
}
