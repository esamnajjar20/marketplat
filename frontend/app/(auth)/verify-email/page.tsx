import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

const VerifyEmailClient = dynamic(
  () =>
    import('@/components/auth/VerifyEmailClient').then(
      (module) => module.VerifyEmailClient,
    ),
  { loading: () => <div className="flex justify-center py-12"><LoadingSpinner /></div> },
);

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
