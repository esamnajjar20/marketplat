import type { Metadata } from 'next';
import { ServicesPageShell } from '@/components/services/ServicesPageShell';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'الخدمات', path: '/services' });

export default function ServicesPage() {
  return <ServicesPageShell />;
}
