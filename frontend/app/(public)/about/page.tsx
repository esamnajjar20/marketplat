import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell } from '@/components/shared/legal/LegalPageShell';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({
  title: 'من نحن',
  description: 'سوق غزة — منصة محلية للبيع والشراء والخدمات بين أهل غزة.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <LegalPageShell
      title="من نحن"
      description="منصة محلية تجمع الجيران للبيع والشراء وطلب الخدمات بثقة ووضوح."
    >
      <h2>رسالتنا</h2>
      <p>
        سوق غزة وُجد لتسهيل التبادل التجاري اليومي داخل القطاع: إعلانات فردية،
        متاجر، ومقدمو خدمات — في مكان واحد بواجهة عربية واضحة.
      </p>
      <h2>ماذا نقدّم؟</h2>
      <ul>
        <li>نشر وتصفّح إعلانات السلع بسرعة.</li>
        <li>متاجر ومنتجات مع إدارة لصاحب المتجر.</li>
        <li>خدمات ومقدمو خدمة مع طلبات ومواعيد.</li>
        <li>محادثات مباشرة بين البائع والمشتري.</li>
      </ul>
      <h2>ابدأ الآن</h2>
      <p>
        تصفّح <Link href={ROUTES.search}>البحث</Link> أو{' '}
        <Link href={ROUTES.register}>أنشئ حسابًا</Link> لنشر أول إعلان.
      </p>
    </LegalPageShell>
  );
}
