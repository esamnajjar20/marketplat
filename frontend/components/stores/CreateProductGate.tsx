'use client';

import Link from 'next/link';
import { AlertCircle, Clock } from 'lucide-react';
import { ProductForm } from '@/components/stores/ProductForm';
import { RequireProfileGate } from '@/components/shared/gates/RequireProfileGate';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { useMyStore } from '@/hooks/queries/useStores';
import { ROUTES } from '@/lib/constants';

/**
 * Gates product creation behind store ownership — mirrors CreateAdGate's
 * seller-profile check.
 *
 * `RequireProfileGate` only distinguished
 * "no store" (404) from "network error / real data" — it did NOT look
 * at the returned store's own status. A user whose store is PENDING
 * (awaiting admin approval) or BLOCKED passed the gate, filled out the
 * entire product form, and only learned on submit that the backend
 * rejects this with 403 STORE_NOT_ACTIVE (see products.service.ts:75).
 * That's the same shape of "wasted work" bug CreateAdGate / the other
 * gates were built to prevent, just one layer deeper: ownership isn't
 * the only requirement — the store has to be ACTIVE. Handled here
 * rather than inside RequireProfileGate because only stores have a
 * status enum; the other gate targets (seller profile, service
 * provider) don't.
 */
export function CreateProductGate() {
  const query = useMyStore();

  if (query.data && query.data.status === 'PENDING') {
    return (
      <EmptyState
        icon={<Clock className="h-8 w-8" />}
        title="متجرك قيد المراجعة"
        description="لا يمكنك نشر منتجات حتى يوافق الأدمن على متجرك. ستتمكن من الإضافة مباشرة بعد الموافقة."
        action={
          <Button asChild variant="outline">
            <Link href={ROUTES.myStore}>الذهاب إلى متجري</Link>
          </Button>
        }
      />
    );
  }

  if (query.data && query.data.status === 'BLOCKED') {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="متجرك موقوف"
        description="لا يمكنك نشر منتجات في الوقت الحالي. تواصل مع الدعم لمعرفة السبب."
        action={
          <Button asChild variant="outline">
            <Link href={ROUTES.myStore}>الذهاب إلى متجري</Link>
          </Button>
        }
      />
    );
  }

  return (
    <RequireProfileGate
      query={query}
      setupHref={ROUTES.myStore}
      from={ROUTES.myStoreProductCreate}
      title="افتح متجرك أولاً"
      description="تحتاج إلى فتح متجر قبل أن تتمكن من إضافة منتجات"
      ctaLabel="فتح متجر"
    >
      <ProductForm mode="create" />
    </RequireProfileGate>
  );
}
