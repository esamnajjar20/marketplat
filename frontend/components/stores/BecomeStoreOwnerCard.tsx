'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useCreateStore } from '@/hooks/mutations/useStoreMutations';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES, CITIES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

interface Errors {
  name?: string;
  description?: string;
  city?: string;
  phone?: string;
}

/**
 * Store is built on top of an existing SellerProfile, exactly like
 * ServiceProviderDetails — mirrors BecomeServiceProviderCard's
 * "check seller profile first, show the right CTA" shape one-for-one.
 */
export function BecomeStoreOwnerCard() {
  const { data: sellerProfile, isLoading: isLoadingSeller } = useMySellerProfile();
  const createStore = useCreateStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

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
        <h2 className="text-lg font-semibold">افتح متجرك</h2>
        <p className="text-sm text-muted-foreground">
          يجب أن يكون لديك ملف بائع أولاً قبل فتح متجر.
        </p>
        <Button asChild>
          <Link href={ROUTES.settings.seller}>إنشاء ملف بائع</Link>
        </Button>
      </div>
    );
  }

  function validate(): boolean {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'اسم المتجر قصير جداً';
    if (description.trim().length < 10) e.description = 'الوصف قصير جداً (10 أحرف على الأقل)';
    if (!city) e.city = 'اختر المدينة';
    if (phone.trim().length < 7) e.phone = 'رقم الهاتف مطلوب';
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    createStore.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        city,
        address: address.trim() || undefined,
        phone: phone.trim(),
      },
      { onError: (err) => setServerErrors(parseApiError(err).fieldErrors) }
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">افتح متجرك</h2>
        <p className="text-sm text-muted-foreground">
          أنشئ متجرك لتتمكن من عرض منتجاتك واستقبال الزبائن.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="اسم المتجر" htmlFor="store-name" required error={fieldError('name')}>
          <Input
            id="store-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: متجر أبو محمد للأدوات المنزلية"
          />
        </FormField>

        <FormField label="الوصف" htmlFor="store-description" required error={fieldError('description')}>
          <textarea
            id="store-description"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="اشرح ما يقدمه متجرك..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{description.length}/1000</p>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="store-city" className="text-sm font-medium">
              المدينة <span className="text-destructive">*</span>
            </label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger id="store-city"><SelectValue placeholder="اختر المدينة" /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError('city') && <p className="text-xs text-destructive">{fieldError('city')}</p>}
          </div>

          <FormField label="رقم الهاتف" htmlFor="store-phone" required error={fieldError('phone')}>
            <Input
              id="store-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
            />
          </FormField>
        </div>

        <FormField label="العنوان (اختياري)" htmlFor="store-address">
          <Input
            id="store-address"
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="الشارع، الحي..."
          />
        </FormField>

        <Button type="submit" disabled={createStore.isPending}>
          {createStore.isPending ? 'جارٍ الإنشاء…' : 'إنشاء المتجر'}
        </Button>
      </form>
    </div>
  );
}
