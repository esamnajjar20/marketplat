import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, Inbox } from 'lucide-react';
import { MyServiceListingsList } from '@/components/services/MyServiceListingsList';
import { Button } from '@/components/shared/ui/Button';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'خدماتي', noIndex: true });

export default function MyServicesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">خدماتي</h1>
        <div className="flex gap-2">
          <Link href={ROUTES.incomingServiceRequests}>
            <Button size="sm" variant="outline" className="gap-1.5"><Inbox className="h-4 w-4" />الطلبات الواردة</Button>
          </Link>
          <Link href={ROUTES.myServiceCreate}>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />خدمة جديدة</Button>
          </Link>
        </div>
      </div>
      <Suspense><MyServiceListingsList /></Suspense>
    </div>
  );
}
