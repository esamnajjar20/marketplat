'use client';

import Link from 'next/link';
import {
  Megaphone,
  Package,
  Wrench,
  ClipboardList,
  ChevronLeft,
  FileEdit,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * CREATE-SHEET — single publish entry from BottomNav "+" (UI-).
 * Policy: one primary create surface; guest floating bar only reinforces
 * the same CreateSheet — no third competing destination.
 */
const CREATE_LINKS = [
  {
    label: 'إعلان جديد',
    description: 'بيع شيء بسرعة — مجاني',
    href: ROUTES.adCreate,
    icon: Megaphone,
    primary: true,
    iconClass: 'bg-primary/12 text-primary',
  },
  {
    label: 'منتج جديد',
    description: 'أضف لمنتجات متجرك',
    href: ROUTES.myStoreProductCreate,
    icon: Package,
    primary: false,
    iconClass: 'bg-accent/12 text-accent',
  },
  {
    label: 'خدمة جديدة',
    description: 'اعرض خدمة تقدّمها',
    href: ROUTES.myServiceCreate,
    icon: Wrench,
    primary: false,
    iconClass: 'bg-success/12 text-success',
  },
  {
    label: 'طلب / احتياج',
    description: 'انشر طلبك واستقبل العروض',
    href: ROUTES.requestNew,
    icon: ClipboardList,
    primary: false,
    iconClass: 'bg-warning/15 text-warning-foreground',
  },
] as const;

export function CreateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0">
        <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-1">
          <SheetTitle className="text-base font-bold">ماذا تريد أن تضيف؟</SheetTitle>
          <p className="text-2xs text-muted-foreground">
            اختر النوع — المسودات تُحفظ تلقائياً ويمكن إكمالها لاحقاً
          </p>
        </SheetHeader>

        <nav
          aria-label="إضافة عنصر جديد"
          className="flex flex-col gap-2 px-4 pt-3"
        >
          {CREATE_LINKS.map(({ label, description, href, icon: Icon, primary, iconClass }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              onClick={() => onOpenChange(false)}
              className={cn(
                'group flex min-h-14 items-center gap-3 rounded-xl border px-3 py-3 transition-colors active:scale-[0.99]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                primary
                  ? 'border-primary/35 bg-primary/5 shadow-sm hover:bg-primary/10'
                  : 'border-border/70 bg-card hover:border-border hover:bg-muted/60',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                  iconClass,
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm font-semibold text-foreground',
                    primary && 'text-primary',
                  )}
                >
                  {label}
                </span>
                <span className="mt-0.5 block text-2xs text-muted-foreground sm:text-xs">
                  {description}
                </span>
              </span>
              <ChevronLeft
                className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:-translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          ))}
        </nav>

        <div className="mt-2 border-t border-border/60 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <Link
            href={ROUTES.offline.drafts}
            prefetch={false}
            onClick={() => onOpenChange(false)}
            className="flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <FileEdit className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">متابعة المسودات غير المكتملة</span>
            <ChevronLeft className="h-4 w-4 opacity-50" aria-hidden />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { CREATE_LINKS };
