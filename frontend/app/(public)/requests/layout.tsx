import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

/**
 * SW-SEO-REQUESTS-INDEX-01: requests/page.tsx is a client component
 * (uses useSearchParams for filters) and Next.js forbids exporting
 * `metadata` from a client module — the page had no <title>, no
 * description, no Open Graph, no canonical. A layout sibling is the
 * standard Next.js escape hatch: the route segment inherits this
 * metadata while the page itself stays a client component.
 */
export const metadata: Metadata = buildMetadata({
  title: 'سوق الطلبات — طلبات مفتوحة في غزة',
  description:
    'تصفّح الطلبات المفتوحة في غزة: خدمات، منتجات، وإيجارات. قدّم عرضك مباشرة لمن يبحث عمّا تقدّمه.',
  path: '/requests',
});
