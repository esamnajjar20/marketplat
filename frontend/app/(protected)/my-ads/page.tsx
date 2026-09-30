import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { MyAdsList } from '@/components/profile/MyAdsList';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';
import { Button } from '@/components/shared/ui/Button';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'إعلاناتي', noIndex: true });

export default function MyAdsPage() {
  return (
    <AccountPageShell
      title="إعلاناتي"
      description="إدارة الإعلانات النشطة والمباعة — صفِّ حسب الحالة أو حدّد عدة عناصر."
      actions={
        <Link prefetch={false} href={ROUTES.adCreate}>
          <Button size="sm" className="min-h-10 gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            إعلان جديد
          </Button>
        </Link>
      }
    >
      <Suspense>
        <MyAdsList />
      </Suspense>
    </AccountPageShell>
  );
}
