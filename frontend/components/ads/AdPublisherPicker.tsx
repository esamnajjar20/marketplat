'use client';

/**
 * اختيار جهة نشر الإعلان: حساب شخصي أو متجر مملوك.
 * يُستخدم فقط في وضع الإنشاء (create).
 */

import { useMyStore } from '@/hooks/queries/useStores';
import { cn } from '@/lib/utils';
import { Building2, User } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export type PublisherMode = 'personal' | 'store';

interface Props {
  mode: PublisherMode;
  storeId: string | null;
  onChange: (mode: PublisherMode, storeId: string | null) => void;
  className?: string;
}

export function AdPublisherPicker({ mode, onChange, className }: Props) {
  const { data: myStore, isLoading } = useMyStore();

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const hasStore = Boolean(myStore?.id);
  const storeActive = myStore?.status === 'ACTIVE';

  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="text-sm font-medium">من ينشر هذا الإعلان؟</legend>
      <p className="text-xs text-muted-foreground">
        الحساب الشخصي يظهر باسمك. المتجر يظهر باسم المتجر للزوّار، مع بقاء ملكية الإعلان لك.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange('personal', null)}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-3 text-start transition-colors',
            mode === 'personal'
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'hover:bg-muted/50'
          )}
        >
          <User className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <span>
            <span className="block text-sm font-medium">حسابي الشخصي</span>
            <span className="text-xs text-muted-foreground">إعلان شخصي باسمك</span>
          </span>
        </button>

        <button
          type="button"
          disabled={!hasStore || !storeActive}
          onClick={() => {
            if (myStore?.id) onChange('store', myStore.id);
          }}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-3 text-start transition-colors',
            mode === 'store'
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'hover:bg-muted/50',
            (!hasStore || !storeActive) && 'cursor-not-allowed opacity-50'
          )}
        >
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <span>
            <span className="block text-sm font-medium">
              {hasStore ? `متجري: ${myStore!.name}` : 'متجري'}
            </span>
            <span className="text-xs text-muted-foreground">
              {!hasStore
                ? 'أنشئ متجرًا أولًا من لوحة المتجر'
                : !storeActive
                  ? 'المتجر غير مفعّل بعد (بانتظار الموافقة)'
                  : 'يظهر كإعلان من المتجر'}
            </span>
          </span>
        </button>
      </div>
    </fieldset>
  );
}
