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

/**
 * FIX LAYOUT-NEEDS-DEFAULT-01: Next.js layout files must export a
 * default component. The previous version of this file only exported
 * `metadata`, which type-checked fine in isolation but failed
 * Next.js's own build-time layout validator:
 *   "Property 'default' is missing in type ... but required in type
 *    'LayoutConfig<"/requests">'"
 * A layout that adds nothing to the tree except metadata still needs
 * the pass-through component — this is it.
 */
export default function RequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
