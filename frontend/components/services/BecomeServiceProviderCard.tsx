'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { WorkingHoursEditor } from './WorkingHoursEditor';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useCreateServiceProvider } from '@/hooks/mutations/useServiceProviderMutations';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { getSafeRedirectPath } from '@/lib/cookies';
import type { ServiceBusinessType, WorkingHours } from '@/types/service.types';

const EMPTY_HOURS: WorkingHours = {
  sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null,
};

interface Errors {
  businessName?: string;
  description?: string;
  serviceAreaCities?: string;
  contactPhone?: string;
  workingHours?: string;
}

const DAY_LABELS: Record<keyof WorkingHours, string> = {
  sat: 'السبت', sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء',
  wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة',
};

/**
 * FIX BUG-XX: WorkingHoursEditor had no per-day open < close validation,
 * and neither did this form's validate() — an invalid schedule (e.g.
 * open 17:00, close 09:00) only surfaced as a generic toast from the
 * backend's Zod rejection (useCreateServiceProvider's onError), with
 * nothing pointing at the working-hours section like every other field
 * gets. Mirrors the identical fix in MyServiceProviderCard.
 */
function validateWorkingHours(hours: WorkingHours): string | undefined {
  for (const [day, schedule] of Object.entries(hours) as [keyof WorkingHours, WorkingHours[keyof WorkingHours]][]) {
    if (schedule && schedule.open >= schedule.close) {
      return `${DAY_LABELS[day]}: وقت الإغلاق يجب أن يكون بعد وقت الفتح`;
    }
  }
  return undefined;
}

export function BecomeServiceProviderCard() {
  // Reflects the architectural decision "service sits on top of the
  // seller profile" from services-design.md, at the UI layer too, not
  // just enforced server-side (createServiceProvider would 4xx anyway
  // without a SellerProfile — this just avoids a wasted round trip and
  // shows the right CTA instead of a confusing form-then-error).
  const { data: sellerProfile, isLoading: isLoadingSeller } = useMySellerProfile();
  const createProvider = useCreateServiceProvider();
  const router = useRouter();
  const searchParams = useSearchParams();

  // FIX P0-1 (unified pattern, mirrors BecomeSellerCard): when reached
  // via CreateServiceListingGate's "تفعيل ملف مقدم خدمة" link
  // (?from=/my-services/new), send the user back to their original
  // intent after the profile is created.
  const from = searchParams.get('from');

  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<ServiceBusinessType>('INDIVIDUAL');
  const [description, setDescription] = useState('');
  const [citiesInput, setCitiesInput] = useState('');
  const [workingHours, setWorkingHours] = useState<WorkingHours>(EMPTY_HOURS);
  const [contactPhone, setContactPhone] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();
  // FIX SUBMIT-DOUBLE: the submit button already carries
  // `disabled={isFormIncomplete || createProvider.isPending}`, but
  // that only covers clicks on the button itself. Pressing Enter
  // inside any text field fires the form's submit handler directly,
  // bypassing that disabled state entirely — and React Query does
  // not flip isPending synchronously, so two rapid Enters (a tap
  // that registered twice, an autocorrect confirm followed by a
  // Return) both pass the isFormIncomplete check and both fire
  // mutate(). On the slower connections this app targets, the
  // window between the first submit and the pending update is
  // easily a few hundred milliseconds. The ref is a synchronous
  // guard that does not depend on React's render cycle; mirrors
  // the same pattern in ServiceListingForm.
  const isSubmittingRef = useRef(false);

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  if (isLoadingSeller) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!sellerProfile) {
    return (
      <div className="space-y-3 max-w-lg">
        <h2 className="text-lg font-semibold">أصبح مقدم خدمة</h2>
        <p className="text-sm text-muted-foreground">
          يجب أن يكون لديك ملف بائع أولاً قبل تفعيل تقديم الخدمات.
        </p>
        <Button asChild>
          <Link href={ROUTES.settings.seller}>إنشاء ملف بائع</Link>
        </Button>
      </div>
    );
  }

  function validate(): boolean {
    const e: Errors = {};
    if (businessName.trim().length < 2) e.businessName = 'اسم النشاط قصير جداً';
    if (description.trim().length < 10) e.description = 'الوصف قصير جداً (10 أحرف على الأقل)';
    const cities = citiesInput.split(',').map((c) => c.trim()).filter(Boolean);
    if (cities.length === 0) e.serviceAreaCities = 'أضف مدينة واحدة على الأقل';
    if (contactPhone.trim().length < 6) e.contactPhone = 'رقم التواصل مطلوب';
    const hoursError = validateWorkingHours(workingHours);
    if (hoursError) e.workingHours = hoursError;
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  // UX-FIX (paired with BecomeStoreOwnerCard's identical fix): the
  // submit button was tappable on an empty form. Mirrors validate()'s
  // rules read-only, with no setErrors call — the inline red messages
  // still only appear after an actual submit attempt.
  const isFormIncomplete =
    businessName.trim().length < 2 ||
    description.trim().length < 10 ||
    citiesInput.split(',').map((c) => c.trim()).filter(Boolean).length === 0 ||
    contactPhone.trim().length < 6;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!validate()) return;
    isSubmittingRef.current = true;

    const serviceAreaCities = citiesInput.split(',').map((c) => c.trim()).filter(Boolean);

    createProvider.mutate(
      {
        businessName: businessName.trim(),
        businessType,
        description: description.trim(),
        serviceAreaCities,
        workingHours,
        contactPhone: contactPhone.trim(),
      },
      {
        onSuccess: () => {
          // Reset even though the parent swaps this card out on
          // success (useCreateServiceProvider invalidates the
          // serviceProviders.me() query, and both mount sites
          // render BecomeServiceProviderCard only while !provider).
          // The reset costs nothing and stays correct if that
          // unmount ever stops being guaranteed — e.g. if the
          // invalidation fails silently and the card lingers.
          isSubmittingRef.current = false;
          if (from) router.push(getSafeRedirectPath(from));
        },
        onError: (err) => {
          isSubmittingRef.current = false;
          setServerErrors(parseApiError(err).fieldErrors);
        },
      }
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">أصبح مقدم خدمة</h2>
        <p className="text-sm text-muted-foreground">
          أنشئ ملف مقدم الخدمة لتتمكن من نشر خدماتك واستقبال الطلبات.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="اسم النشاط" htmlFor="business-name" required error={fieldError('businessName')}>
          <Input
            id="business-name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="مثال: كهرباء أبو محمد"
          />
        </FormField>

        <div className="space-y-1.5">
          <label htmlFor="business-type" className="text-sm font-medium">نوع النشاط</label>
          <Select value={businessType} onValueChange={(v) => setBusinessType(v as ServiceBusinessType)}>
            <SelectTrigger id="business-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="INDIVIDUAL">فرد</SelectItem>
              <SelectItem value="SMALL_BUSINESS">عمل صغير</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <FormField label="الوصف" htmlFor="description" required error={fieldError('description')}>
          <textarea
            id="description"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="اشرح خدماتك وخبرتك..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{description.length}/1000</p>
        </FormField>

        <FormField
          label="مناطق الخدمة (مدن مفصولة بفاصلة)"
          htmlFor="cities"
          required
          error={fieldError('serviceAreaCities')}
        >
          <Input
            id="cities"
            value={citiesInput}
            onChange={(e) => setCitiesInput(e.target.value)}
            placeholder="غزة، خان يونس، رفح"
          />
        </FormField>

        <FormField label="رقم التواصل" htmlFor="contact-phone" required error={fieldError('contactPhone')}>
          <Input
            id="contact-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="05xxxxxxxx"
          />
        </FormField>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">ساعات العمل</label>
          <WorkingHoursEditor
            value={workingHours}
            onChange={(v) => { setWorkingHours(v); setErrors((prev) => ({ ...prev, workingHours: undefined })); }}
          />
          {fieldError('workingHours') && (
            <p className="text-xs text-destructive" role="alert" aria-live="assertive">
              {fieldError('workingHours')}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isFormIncomplete || createProvider.isPending}>
          {createProvider.isPending ? 'جارٍ الإنشاء…' : 'إنشاء ملف مقدم الخدمة'}
        </Button>
      </form>
    </div>
  );
}
