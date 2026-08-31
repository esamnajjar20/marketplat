import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell } from '@/components/shared/legal/LegalPageShell';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({
  title: 'تواصل معنا',
  description: 'قنوات التواصل مع فريق سوق غزة.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <LegalPageShell
      title="تواصل معنا"
      description="نسعد بملاحظاتك وبلاغات المشاكل. اختر القناة الأنسب لحالتك."
    >
      <h2>الدعم العام</h2>
      <p>
        للأسئلة حول الحساب أو النشر، راسلنا على البريد (يُستبدل بعنوانكم الرسمي):
        <br />
        <span className="font-medium text-foreground">support@example.com</span>
      </p>
      <h2>الإبلاغ عن محتوى</h2>
      <p>
        من صفحة الإعلان أو الملف الشخصي استخدم زر «إبلاغ» عند توفره، أو صف المشكلة
        في رسالة الدعم مع رابط الصفحة.
      </p>
      <h2>روابط مفيدة</h2>
      <ul>
        <li>
          <Link href={ROUTES.privacy}>سياسة الخصوصية</Link>
        </li>
        <li>
          <Link href={ROUTES.terms}>شروط الاستخدام</Link>
        </li>
        <li>
          <Link href={ROUTES.about}>من نحن</Link>
        </li>
      </ul>
    </LegalPageShell>
  );
}
