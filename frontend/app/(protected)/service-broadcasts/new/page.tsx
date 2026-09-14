import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateServiceBroadcastForm } from '@/components/services/CreateServiceBroadcastForm';
import { ROUTES } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'نشر طلب في سوق الطلبات',
  noIndex: true,
});

export default function NewServiceBroadcastPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <Link
          href={ROUTES.serviceBroadcasts}
          className="text-sm text-primary hover:underline"
        >
          ← سوق الطلبات
        </Link>
        <h1 className="mt-2 text-xl font-bold">نشر طلب خدمة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اكتب ما تحتاجه — مزوّدو الخدمة يقدّمون عروض أسعار وتختار الأنسب.
        </p>
      </div>
      <CreateServiceBroadcastForm />
    </div>
  );
}
