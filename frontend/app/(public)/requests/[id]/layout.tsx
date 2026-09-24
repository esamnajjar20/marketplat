import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

/**
 * SW-SEO-REQUEST-DETAIL-01: same reasoning as ../layout.tsx — the
 * detail page is 'use client' (uses useParams + useAuthStore), so
 * metadata cannot be exported from the page itself. This layout sits
 * one level down and covers only /requests/:id.
 *
 * We deliberately do NOT fetch the request to build a dynamic title
 * (would need an extra authenticated API call just for metadata, and
 * the endpoint's auth behaviour isn't guaranteed anonymous) — a
 * generic but accurate title is better than a network round-trip that
 * might 401 and break the metadata render.
 */
export const metadata: Metadata = buildMetadata({
  title: 'تفاصيل الطلب — سوق غزة',
  description:
    'تفاصيل الطلب المفتوح وعروض التجار، على سوق غزة — تصفّح العروض وقدّم عرضك.',
  path: '/requests',
});
