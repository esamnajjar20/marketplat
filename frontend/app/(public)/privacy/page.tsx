import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell } from '@/components/shared/legal/LegalPageShell';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({
  title: 'سياسة الخصوصية',
  description: 'كيف تجمع سوق غزة بياناتك وتستخدمها وتحميها.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="سياسة الخصوصية"
      description="نوضح هنا أنواع البيانات التي قد نجمعها وكيف نستخدمها. هذه نسخة تعريفية عامة وينبغي مواءمتها قانونيًا قبل الإطلاق الرسمي."
    >
      <div className="content-prose space-y-5">
      <h2>البيانات التي قد نجمعها</h2>
      <ul>
        <li>بيانات الحساب: الاسم، البريد أو رقم الهاتف، وكلمة المرور بشكل مشفّر.</li>
        <li>محتوى تنشره: إعلانات، صور، رسائل، تقييمات.</li>
        <li>بيانات تقنية أساسية: نوع الجهاز، سجلات أخطاء، وعنوان IP عند الحاجة للأمان.</li>
      </ul>
      <h2>كيف نستخدم البيانات</h2>
      <ul>
        <li>تشغيل الحساب وإظهار إعلاناتك ومحادثاتك.</li>
        <li>تحسين الأمان ومنع الإساءة والاحتيال.</li>
        <li>إرسال إشعارات متعلقة بنشاطك (يمكن ضبطها من الإعدادات).</li>
      </ul>
      <h2>المشاركة مع أطراف أخرى</h2>
      <p>
        لا نبيع بياناتك. قد تُستخدم خدمات بنية تحتية (استضافة، تخزين صور، بريد)
        ضمن حدود تشغيل المنصة فقط.
      </p>
      <h2>حقوقك</h2>
      <p>
        يمكنك تحديث ملفك من الإعدادات، وطلب الدعم عبر{' '}
        <Link href={ROUTES.contact}>صفحة التواصل</Link>.
      </p>
      <h2>التحديثات</h2>
      <p>قد نحدّث هذه الصفحة عند تغيّر الممارسات؛ تاريخ السريان يظهر عند النشر الرسمي.</p>
      </div>
    </LegalPageShell>
  );
}
