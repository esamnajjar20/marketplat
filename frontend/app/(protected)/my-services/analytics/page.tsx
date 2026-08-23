import type { Metadata } from 'next';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { MyServiceProviderAnalytics } from '@/components/services/MyServiceProviderAnalytics';
import { Button } from '@/components/shared/ui/Button';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'إحصائيات مقدم الخدمة', noIndex: true });

// ANALYTICS: same header/back-link layout as my-store/analytics/page.tsx.
export default function MyServiceProviderAnalyticsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">إحصائيات مقدم الخدمة</h1>
        <Link href={ROUTES.myServices}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Wrench className="h-4 w-4" />خدماتي
          </Button>
        </Link>
      </div>
      <MyServiceProviderAnalytics />
    </div>
  );
}
