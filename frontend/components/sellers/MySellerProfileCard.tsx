'use client';

import { useState } from 'react';
import { StorePaymentMethodsEditor } from '@/components/stores/StorePaymentMethodsEditor';
import { normalizePaymentMethods, type StorePaymentMethod } from '@/lib/storePaymentMethods';
import Link from 'next/link';
import {
  BadgeCheck,
  Star,
  ShoppingBag,
  TrendingUp,
  ExternalLink,
  Clock,
  ShieldCheck,
  Shield,
  MessageCircle,
  Pencil,
} from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import {
  useRequestSellerVerification,
  useUpdateSellerProfile,
} from '@/hooks/mutations/useSellerMutations';
import { parseApiError } from '@/lib/errorParser';
import type { SellerProfile } from '@/types/seller.types';

interface Props {
  profile: SellerProfile;
}

export function MySellerProfileCard({ profile }: Props) {
  const rating = parseFloat(profile.averageRating);
  const requestVerification = useRequestSellerVerification();
  const updateProfile = useUpdateSellerProfile();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  // Always-visible, independent of the displayName/bio edit form below —
  // mirrors MyServiceProviderCard's StorePaymentMethodsEditor, which is
  // never hidden behind an edit-mode toggle either.
  const [paymentMethods, setPaymentMethods] = useState<StorePaymentMethod[]>(
    () => normalizePaymentMethods((profile as { paymentMethods?: unknown }).paymentMethods),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>();

  const paymentMethodsChanged =
    JSON.stringify(paymentMethods) !==
    JSON.stringify(normalizePaymentMethods((profile as { paymentMethods?: unknown }).paymentMethods));

  function startEdit() {
    setDisplayName(profile.displayName);
    setBio(profile.bio ?? '');
    setFieldErrors(undefined);
    setEditing(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (displayName.trim().length < 2) {
      setFieldErrors({ displayName: ['اسم العرض قصير جداً'] });
      return;
    }
    updateProfile.mutate(
      {
        displayName: displayName.trim(),
        paymentMethods,
        bio: bio.trim() ? bio.trim() : null,
      },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setFieldErrors(parseApiError(err).fieldErrors),
      },
    );
  }

  // Saves payment methods on their own — lets the user update them
  // without opening the displayName/bio edit form first. Local state is
  // reset to what was just sent so the "unsaved changes" comparison
  // above goes back to false immediately (same pattern as
  // MyServiceProviderCard's saveWorkingHours).
  function savePaymentMethods() {
    updateProfile.mutate(
      { paymentMethods },
      { onSuccess: () => setPaymentMethods(paymentMethods) },
    );
  }

  const responseRate =
    profile.responseRate !== null ? parseFloat(profile.responseRate) : null;

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">{profile.displayName}</h2>
        {profile.verified ? (
          <Badge className="gap-1">
            <BadgeCheck className="h-3.5 w-3.5" /> بائع موثّق
          </Badge>
        ) : (
          <Badge variant="secondary">غير موثّق</Badge>
        )}
        {!editing && (
          <Button type="button" variant="ghost" size="sm" className="gap-1 ms-auto" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" /> تعديل
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSave} noValidate className="space-y-3 rounded-lg border p-3">
          <FormField
            label="اسم العرض"
            htmlFor="seller-edit-name"
            required
            error={fieldErrors?.displayName?.[0]}
          >
            <Input
              id="seller-edit-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
            />
          </FormField>
          <FormField label="نبذة" htmlFor="seller-edit-bio" error={fieldErrors?.bio?.[0]}>
            <textarea
              id="seller-edit-bio"
              rows={3}
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-end">{bio.length}/300</p>
          </FormField>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={updateProfile.isPending}
              onClick={() => setEditing(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      ) : (
        profile.bio && <p className="text-sm text-muted-foreground">{profile.bio}</p>
      )}

      {/* Always visible — not tied to the `editing` toggle above, so
          payment methods stay reachable/visible on this page the same
          way they do on MyServiceProviderCard. */}
      <div className="space-y-1.5">
        <StorePaymentMethodsEditor value={paymentMethods} onChange={setPaymentMethods} title="طرق دفع البائع" />
        {paymentMethodsChanged && (
          <Button
            type="button"
            size="sm"
            onClick={savePaymentMethods}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? 'جارٍ الحفظ…' : 'حفظ طرق الدفع'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 rounded-md border p-3">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{profile.activeAds}</p>
            <p className="text-xs text-muted-foreground">إعلان نشط</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{profile.totalSales}</p>
            <p className="text-xs text-muted-foreground">صفقة مكتملة</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-3">
          <Star className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {profile.totalRatings > 0 ? rating.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{profile.totalRatings} تقييم</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-3">
          <div>
            <p className="font-medium">{formatDate(profile.joinedSellingAt)}</p>
            <p className="text-xs text-muted-foreground">تاريخ الانضمام كبائع</p>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground">مؤشرات الثقة</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-medium tabular-nums">{profile.trustScore}/1000</p>
              <p className="text-[11px] text-muted-foreground">درجة الثقة</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
            <MessageCircle className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-medium tabular-nums">
                {responseRate !== null ? `${responseRate.toFixed(0)}%` : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground">نسبة الرد</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-medium tabular-nums">
                {profile.responseTimeMinutes != null
                  ? `~${profile.responseTimeMinutes} د`
                  : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground">متوسط وقت الرد</p>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          حسّن درجتك بالرد السريع على الرسائل، إكمال الصفقات، والحفاظ على تقييمات إيجابية.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href={ROUTES.userProfile(profile.userId)}>
            عرض صفحتي العامة <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button size="sm" asChild className="gap-1.5">
          <Link href={ROUTES.myStore}>
            <ShoppingBag className="h-3.5 w-3.5" /> أنشئ متجرك الآن
          </Link>
        </Button>
      </div>

      {!profile.verified &&
        (profile.verificationStatus === 'PENDING' ? (
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium">
              <Clock className="h-4 w-4" />
              طلب التوثيق قيد المراجعة
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              تراجع الإدارة الطلب خلال أيام عمل. قد يُطلب صورة للنشاط أو إثبات هوية عبر الرسائل — أبقِ الهاتف وملف البائع محدّثين.
            </p>
          </div>
        ) : profile.verificationStatus === 'REJECTED' ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">لم يُقبل الطلب السابق. حسّن بياناتك ثم أعد المحاولة.</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={requestVerification.isPending}
              onClick={() => requestVerification.mutate()}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {requestVerification.isPending ? 'جارٍ الإرسال…' : 'إعادة طلب التوثيق'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              التوثيق يزيد ثقة المشترين. تأكد من اكتمال الاسم والنبذة قبل الإرسال.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={requestVerification.isPending}
              onClick={() => requestVerification.mutate()}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {requestVerification.isPending ? 'جارٍ الإرسال…' : 'طلب توثيق الحساب'}
            </Button>
          </div>
        ))}
    </div>
  );
}
