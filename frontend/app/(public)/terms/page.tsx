import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell } from '@/components/shared/legal/LegalPageShell';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({
  title: 'شروط الاستخدام',
  description: 'القواعد الأساسية لاستخدام منصة سوق غزة.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalPageShell
      title="شروط الاستخدام"
      description="باستخدامك للمنصة فإنك توافق على القواعد التالية. هذه صياغة عامة ويُنصح بمراجعة قانونية قبل الاعتماد الرسمي."
    >
      <div className="content-prose space-y-5">
      <h2>قبول الشروط</h2>
      <p>استخدام سوق غزة يعني الالتزام بهذه الشروط وبـ<Link href={ROUTES.privacy}>سياسة الخصوصية</Link>.</p>
      <h2>حسابك</h2>
      <ul>
        <li>أنت مسؤول عن سرية بيانات الدخول ونشاط حسابك.</li>
        <li>قد نعلّق أو نقيّد الحسابات التي تنتهك الأمان أو تزعج الآخرين.</li>
      </ul>
      <h2>المحتوى المنشور</h2>
      <ul>
        <li>يجب أن يكون المحتوى قانونيًا وغير مضلّل.</li>
        <li>يُمنع نشر مواد مسيئة أو احتيالية أو تنتهك حقوق الغير.</li>
        <li>المنصة وسيط عرض؛ الصفقات تتم بين المستخدمين مباشرة.</li>
      </ul>
      <h2>المحادثات والإبلاغ</h2>
      <p>
        استخدم نظام البلاغات عند المحتوى المخالف. للاستفسارات:{' '}
        <Link href={ROUTES.contact}>تواصل معنا</Link>.
      </p>
      <h2>إخلاء مسؤولية</h2>
      <p>
        نسعى لاستقرار الخدمة دون ضمان عدم الانقطاع. لسنا طرفًا في معاملات
        الدفع أو التسليم بين المستخدمين ما لم يُذكر خلاف ذلك صراحة.
      </p>
      </div>
    </LegalPageShell>
  );
}
