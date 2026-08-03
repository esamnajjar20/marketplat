'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Store, ExternalLink, Sparkles } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useUpdateStore } from '@/hooks/mutations/useStoreMutations';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES, CITIES } from '@/lib/constants';
import type { StoreDetails, StoreStatus } from '@/types/store.types';

interface Props {
  store: StoreDetails;
}

const STATUS_LABELS: Record<StoreStatus, string> = {
  PENDING: 'قيد المراجعة',
  ACTIVE: 'نشط',
  BLOCKED: 'محظور',
};

const STATUS_VARIANTS: Record<StoreStatus, 'default' | 'secondary' | 'destructive'> = {
  PENDING: 'secondary',
  ACTIVE: 'default',
  BLOCKED: 'destructive',
};

interface Errors {
  name?: string;
  description?: string;
  city?: string;
  phone?: string;
}

export function MyStoreCard({ store }: Props) {
  const updateStore = useUpdateStore();

  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description);
  const [city, setCity] = useState(store.city);
  const [address, setAddress] = useState(store.address ?? '');
  const [phone, setPhone] = useState(store.phone);
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
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

    updateStore.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        city,
        address: address.trim() || null,
        phone: phone.trim(),
      },
      { onError: (err) => setServerErrors(parseApiError(err).fieldErrors) }
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <Store className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{store.name}</h2>
        <Badge variant={STATUS_VARIANTS[store.status]}>{STATUS_LABELS[store.status]}</Badge>
        {store.plan === 'FEATURED' && (
          <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
            <Sparkles className="h-3.5 w-3.5" /> مميز
          </Badge>
        )}
      </div>

      {store.status === 'PENDING' && (
        <p className="text-sm text-muted-foreground rounded-md border bg-muted/50 p-3">
          متجرك قيد المراجعة من قِبل الإدارة. سيظهر في دليل المتاجر بعد الموافقة عليه.
        </p>
      )}
      {store.status === 'BLOCKED' && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
          تم حظر متجرك. تواصل مع الدعم لمزيد من التفاصيل.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="اسم المتجر" htmlFor="my-store-name" required error={fieldError('name')}>
          <Input id="my-store-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>

        <FormField label="الوصف" htmlFor="my-store-description" required error={fieldError('description')}>
          <textarea
            id="my-store-description"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground text-end">{description.length}/1000</p>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="my-store-city" className="text-sm font-medium">
              المدينة <span className="text-destructive">*</span>
            </label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger id="my-store-city"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError('city') && <p className="text-xs text-destructive">{fieldError('city')}</p>}
          </div>

          <FormField label="رقم الهاتف" htmlFor="my-store-phone" required error={fieldError('phone')}>
            <Input id="my-store-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
        </div>

        <FormField label="العنوان (اختياري)" htmlFor="my-store-address">
          <Input
            id="my-store-address"
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
          />
        </FormField>

        <Button type="submit" disabled={updateStore.isPending}>
          {updateStore.isPending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {store.status === 'ACTIVE' && (
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href={ROUTES.storeDetail(store.id)}>
              عرض صفحتي العامة <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.myStoreProducts}>إدارة منتجاتي</Link>
        </Button>
        {/* AUDIT-FIX (protected #3): /my-store/followed had no link
            anywhere in the app — grep across app/ and components/ found
            only its own internal pagination baseUrl. This card is the
            most logical entry point for "my relationship to the store
            system", so the link lives here alongside product management. */}
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.myFollowedStores}>المتاجر المتابَعة</Link>
        </Button>
      </div>
    </div>
  );
}
