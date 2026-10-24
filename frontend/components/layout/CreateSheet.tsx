'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  Package,
  Wrench,
  ClipboardList,
  ChevronLeft,
  FileEdit,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';
import { useAuthStore, selectLastKnownRoles, selectHydratedUser, type LastKnownRoles } from '@/store/auth.store';
import { usePendingDraftsCount } from '@/hooks/usePendingDraftsCount';

export const CREATE_LINKS = [
  {
    label: 'إعلان جديد',
    description: 'بيع شيء بسرعة — مجاني',
    href: ROUTES.adCreate,
    icon: Megaphone,
  },
  {
    label: 'منتج جديد',
    description: 'أضف لمنتجات متجرك',
    href: ROUTES.myStoreProductCreate,
    icon: Package,
  },
  {
    label: 'خدمة جديدة',
    description: 'اعرض خدمة تقدّمها',
    href: ROUTES.myServiceCreate,
    icon: Wrench,
  },
  {
    label: 'طلب / احتياج',
    description: 'انشر طلبك واستقبل العروض',
    href: ROUTES.requestNew,
    icon: ClipboardList,
  },
] as const;

export function getVisibleCreateLinks(roles: LastKnownRoles | null) {
  return CREATE_LINKS.filter((link) => {
    if (link.href === ROUTES.adCreate) return Boolean(roles?.isSeller);
    if (link.href === ROUTES.myStoreProductCreate) return Boolean(roles?.hasActiveStore);
    if (link.href === ROUTES.myServiceCreate) return Boolean(roles?.isProvider);
    return true;
  });
}

export function CreateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const roles = useAuthStore(selectLastKnownRoles);
  // HYDRATION-SAFE: mounted gate prevents SSR/client mismatch on selectHydratedUser
  const userRaw = useAuthStore(selectHydratedUser);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const user = mounted ? userRaw : null;
  const draftsCount = usePendingDraftsCount(user?.id);
  const links = getVisibleCreateLinks(roles);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 rounded-t-[20px] border-[#EAE3D6] p-0">
        <SheetHeader className="space-y-1 px-4 pb-3 pt-2 text-start">
          <SheetTitle className="text-[17px] font-extrabold">ماذا تريد أن تضيف؟</SheetTitle>
          <SheetDescription className="text-[13px] text-[#6B6459]">
            اختر النوع — المسودات تُحفظ تلقائيًا ويمكن إكمالها لاحقًا
          </SheetDescription>
        </SheetHeader>

        <nav aria-label="إضافة محتوى" className="flex flex-col gap-2 px-3 pb-3">
          {links.map(({ label, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-[14px] border border-[#EAE3D6] bg-card px-3 py-3 transition-colors hover:bg-[#FBF9F4]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#E8F1EC] text-primary">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold text-foreground">{label}</span>
                <span className="block text-[12px] text-[#6B6459]">{description}</span>
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-[#6B6459]" aria-hidden />
            </Link>
          ))}
        </nav>

        {draftsCount > 0 && (
          <div className="border-t border-[#EAE3D6] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link
              href={ROUTES.offline.drafts}
              prefetch={false}
              onClick={() => onOpenChange(false)}
              className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#F1C9C4] bg-[#FBEEE6] text-[13px] font-bold text-[#8F3F14]"
            >
              <FileEdit className="h-4 w-4" />
              متابعة المسودات غير المكتملة
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C47A0A] px-1.5 text-[11px] font-extrabold text-white">
                {draftsCount > 9 ? '9+' : draftsCount}
              </span>
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
