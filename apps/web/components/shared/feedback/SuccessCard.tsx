'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  /** full-width primary only (e.g. تم إرسال الطلب → طلباتي) */
  singleAction?: boolean;
}

/**
 * بطاقة نجاح كبرى — مطابقة لتصميم «رسائل النجاح الكبرى».
 * أيقونة دائرية خضراء ناعمة + عنوان + وصف + أزرار.
 */
export function SuccessCard({
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  singleAction = false,
}: Props) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#EAE3D6] bg-white px-5 py-8 text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)]',
        className,
      )}
      role="status"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F1EC] text-[#397F56]">
        <Check className="h-7 w-7" strokeWidth={2.5} aria-hidden />
      </div>
      <h2 className="text-[18px] font-extrabold leading-snug text-[#2A241D]">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#6B6459]">
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div
          className={cn(
            'mt-6 flex flex-wrap items-center justify-center gap-2.5',
            singleAction && 'flex-col',
          )}
        >
          {secondaryAction && !singleAction && (
            <div className="min-w-[7.5rem] flex-1 sm:flex-none">{secondaryAction}</div>
          )}
          {primaryAction && (
            <div className={cn(singleAction ? 'w-full' : 'min-w-[7.5rem] flex-[1.3] sm:flex-none')}>
              {primaryAction}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
