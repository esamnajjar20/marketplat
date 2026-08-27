'use client';

import Link from 'next/link';
import { ShieldCheck, Clock } from 'lucide-react';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';

export function SellerVerificationBanner() {
  const { data: profile, isSuccess } = useMySellerProfile();

  if (!isSuccess || !profile || profile.verified) return null;

  if (profile.verificationStatus === 'PENDING') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <Clock className="h-5 w-5 shrink-0 text-primary mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">طلب التوثيق قيد المراجعة</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            عادةً تراجع الإدارة الطلب خلال أيام عمل. جهّز صورًا واضحة للمتجر أو الهوية إن طُلب منك لاحقًا عبر الرسائل.
          </p>
        </div>
      </div>
    );
  }

  if (profile.verificationStatus === 'REJECTED') {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm">
        <div className="flex-1 space-y-1">
          <p className="font-semibold text-destructive">لم يُقبل طلب التوثيق السابق</p>
          <p className="text-muted-foreground text-xs">
            يمكنك مراجعة ملف البائع وإعادة تقديم الطلب بعد تحسين البيانات الظاهرة للمشترين.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href={ROUTES.settings.seller}>ملف البائع</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border bg-card p-4 text-sm">
      <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1 space-y-0.5">
        <p className="font-semibold">وثّق حسابك كبائع</p>
        <p className="text-xs text-muted-foreground">
          الشارة الموثّقة تزيد ثقة المشترين. اطلب التوثيق من إعدادات ملف البائع.
        </p>
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link href={ROUTES.settings.seller}>طلب التوثيق</Link>
      </Button>
    </div>
  );
}
