'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useCreateCollection, useUpdateCollection } from '@/hooks/mutations/useCollectionMutations';
import { parseApiError } from '@/lib/errorParser';
import type { StoreCollectionWithCount } from '@/types/collection.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted → create mode. Passed → edit mode, pre-fills from this row. */
  collection?: StoreCollectionWithCount | null;
}

interface Values {
  name: string;
  description: string;
  imageUrl: string;
}

interface Errors {
  name?: string;
  imageUrl?: string;
}

const emptyValues: Values = { name: '', description: '', imageUrl: '' };

/**
 * COLLECTIONS (P1): create-and-edit dialog, unlike PromotionForm's
 * create-only design — a collection's name/description/cover are
 * meant to be tweaked freely over its lifetime (there's no "terms are
 * fixed once live" concept the way a Promotion has). imageUrl is a
 * plain URL field, not a file upload — the collections backend module
 * has no multipart endpoint of its own (see collections.validation.ts's
 * z.string().url()), so pointing at an already-hosted image (e.g. one
 * already used as a product photo) is the only supported path here.
 */
export function CollectionForm({ open, onOpenChange, collection }: Props) {
  const isEdit = Boolean(collection);
  const create = useCreateCollection();
  const update = useUpdateCollection(collection?.id ?? '');
  const mutation = isEdit ? update : create;

  const [values, setValues] = useState<Values>(emptyValues);
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  useEffect(() => {
    if (open) {
      setValues(
        collection
          ? {
              name: collection.name,
              description: collection.description ?? '',
              imageUrl: collection.imageUrl ?? '',
            }
          : emptyValues
      );
      setErrors({});
      setServerErrors(undefined);
    }
  }, [open, collection]);

  function fieldError(field: keyof Errors): string | undefined {
    return errors[field] ?? serverErrors?.[field]?.[0];
  }

  function set<K extends keyof Values>(key: K, val: Values[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function validate(): boolean {
    const e: Errors = {};
    if (values.name.trim().length < 2) e.name = 'اسم المجموعة قصير جداً';
    if (values.imageUrl.trim() && !/^https?:\/\//.test(values.imageUrl.trim())) {
      e.imageUrl = 'أدخل رابط صورة صحيح (يبدأ بـ http:// أو https://)';
    }
    setErrors(e);
    setServerErrors(undefined);
    return Object.keys(e).length === 0;
  }

  const isFormIncomplete = values.name.trim().length < 2;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      imageUrl: values.imageUrl.trim() || undefined,
    };

    mutation.mutate(payload, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => setServerErrors(parseApiError(err).fieldErrors),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل المجموعة' : 'مجموعة جديدة'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField label="اسم المجموعة" htmlFor="collection-name" required error={fieldError('name')}>
            <Input
              id="collection-name"
              value={values.name}
              maxLength={100}
              onChange={(e) => set('name', e.target.value)}
              placeholder="مثال: تشكيلة الصيف"
            />
          </FormField>

          <FormField label="الوصف (اختياري)" htmlFor="collection-description">
            <textarea
              id="collection-description"
              rows={2}
              maxLength={500}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </FormField>

          <FormField
            label="رابط صورة الغلاف (اختياري)"
            htmlFor="collection-imageUrl"
            error={fieldError('imageUrl')}
          >
            <Input
              id="collection-imageUrl"
              type="url"
              value={values.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              placeholder="https://..."
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isFormIncomplete || mutation.isPending}>
              {mutation.isPending ? 'جارٍ الحفظ…' : isEdit ? 'حفظ التعديلات' : 'إنشاء المجموعة'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
