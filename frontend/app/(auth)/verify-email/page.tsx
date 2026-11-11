import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { buildMetadata } from '@/lib/seo';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

const VerifyEmailClient = dynamic(
  () =>
    import('@/components/auth/VerifyEmailClient').then(
      (module) => module.VerifyEmailClient,
    ),
  { loading: () => <div className="flex justify-center py-12"><LoadingSpinner /></div> },
);

export const metadata: Metadata = buildMetadata({ title: 'تأكيد البريد الإلكتروني', noIndex: true });

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
