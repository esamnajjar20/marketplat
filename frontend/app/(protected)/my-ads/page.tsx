import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { MyAdsList }     from '@/components/profile/MyAdsList';
import { buildMetadata } from '@/lib/seo';
import Link              from 'next/link';
import { Button }        from '@/components/shared/ui/Button';
import { Plus }          from 'lucide-react';
import { ROUTES }        from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'إعلاناتي', noIndex: true });

export default function MyAdsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">إعلاناتي</h1>
        <Link href={ROUTES.adCreate}>
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />إعلان جديد</Button>
        </Link>
      </div>
      <Suspense><MyAdsList /></Suspense>
    </div>
  );
}
