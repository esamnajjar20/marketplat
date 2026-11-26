'use client';

import Link from 'next/link';
import { ShieldBan } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';
import { ENTITY_PAGE } from '@/components/shared/entity-page/entityPageTokens';

/** Shared public-page state for content owned by a deactivated or suspended account. */
export function PublicAccountBlockedState() {
  return (
    <main className={ENTITY_PAGE}>
      <EmptyState
        icon={<ShieldBan className="h-10 w-10" />}
        title="هذا الحساب محظور"
        description="تم إخفاء الملف الشخصي وجميع محتوياته العامة بسبب إيقاف الحساب أو تعليقه."
        action={
          <Link href={ROUTES.home} className="text-sm font-semibold text-primary hover:underline">
            العودة إلى الرئيسية
          </Link>
        }
      />
    </main>
  );
}
