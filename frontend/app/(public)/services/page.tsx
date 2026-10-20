import type { Metadata } from 'next';
import { ServicesPageClient } from '@/components/services/ServicesPageClient';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'الخدمات', path: '/services' });

export default function ServicesPage() {
  return <ServicesPageClient />;
}
