'use client';

import Link from 'next/link';
import { Megaphone, Package, Wrench, ClipboardList } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { ROUTES } from '@/lib/constants';

/**
 * CREATE-SHEET: BottomNav's raised center button used to be a single
 * Link straight to /ads/create (or /settings/seller for non-sellers) —
 * fine while "إعلان" was the only listing type, but the platform now
 * also has products (stores) and services (providers) as first-class
 * things a user can create, with no shared entry point for "أضف" other
 * than this one button. Rather than picking a single default
 * destination, tapping "+" now opens this sheet with all three —
 * mirrors ExploreSheet one-for-one (same Sheet primitive, same
 * list-of-links layout, same open/onOpenChange contract).
 *
 * Deliberately routes to each vertical's own creation page (adCreate /
 * myStoreProductCreate / myServiceCreate) rather than pre-resolving
 * which the user already has a profile for: all three pages are
 * already gated (CreateAdGate / CreateProductGate / CreateServiceListingGate)
 * and show a "become a seller / open a store / become a provider" CTA
 * first when the profile is missing, redirecting back here (`from`)
 * once it's created — so this sheet doesn't need to duplicate that
 * seller/store/provider lookup just to decide where "+" points.
 *
 * FEAT-CREATE-BROADCAST-01: أضيف "طلب خدمة" كرابع خيار — سوق الطلبات
 * (service-broadcasts) عكس بقية الثلاثة: هنا المستخدم لا يعرض شيئًا
 * (إعلان/منتج/خدمة)، بل ينشر ما يحتاجه ومزوّدو الخدمة يقدّمون عروض أسعار.
 * /service-broadcasts/new صفحة محمية عادية (لا gate خاص بها — أي مستخدم
 * مسجّل دخول يمكنه النشر، لا حاجة لملف بائع/متجر/مزوّد مسبقًا)، فتُضاف
 * هنا بنفس نمط الثلاثة الباقين بدون أي منطق إضافي.
 */
const CREATE_LINKS = [
  { label: 'إعلان جديد', description: 'انشر إعلان بيع', href: ROUTES.adCreate, icon: Megaphone },
  { label: 'منتج جديد', description: 'أضف منتجًا إلى متجرك', href: ROUTES.myStoreProductCreate, icon: Package },
  { label: 'خدمة جديدة', description: 'اعرض خدمة تقدمها', href: ROUTES.myServiceCreate, icon: Wrench },
  { label: 'طلب / احتياج', description: 'خدمة، منتج أو إيجار — واستقبل العروض', href: ROUTES.requestNew, icon: ClipboardList },
] as const;

export function CreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0">
        <SheetHeader>
          <SheetTitle>أضف</SheetTitle>
        </SheetHeader>
        <nav aria-label="إضافة عنصر جديد" className="flex flex-col gap-1 px-4 pb-4">
          {CREATE_LINKS.map(({ label, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden={true} />
              <span className="flex flex-col">
                {label}
                <span className="text-xs font-normal text-muted-foreground">{description}</span>
              </span>
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export { CREATE_LINKS };
