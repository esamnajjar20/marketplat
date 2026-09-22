import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MyStoreMembersList } from '@/components/stores/MyStoreMembersList';
import { MyMemberInvites } from '@/components/stores/MyMemberInvites';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({
  title: 'فريق المتجر',
  noIndex: true,
});

export default function MyStoreMembersPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link prefetch={false} href={ROUTES.myStore}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          العودة للوحة المتجر
        </Link>
        <h1 className="text-xl font-bold">فريق المتجر</h1>
        <p className="text-sm text-muted-foreground">
          أضف مديرين أو محرري منتجات وحدد صلاحيات كل شخص
        </p>
      </div>

      <Suspense>
        <MyMemberInvites />
      </Suspense>

      <Suspense>
        <MyStoreMembersList />
      </Suspense>
    </div>
  );
}
