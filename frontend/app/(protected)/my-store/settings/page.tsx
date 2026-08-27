import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { StoreSettingsSection } from '@/components/stores/StoreSettingsSection';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'إعدادات المتجر', noIndex: true });

export default function MyStoreSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={ROUTES.myStore}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          العودة للوحة المتجر
        </Link>
        <h1 className="text-xl font-bold">إعدادات المتجر</h1>
        <p className="text-sm text-muted-foreground">
          الاسم، الوصف، الشعار، الغلاف، ساعات العمل، والموقع
        </p>
      </div>
      <Suspense>
        <StoreSettingsSection />
      </Suspense>
    </div>
  );
}
