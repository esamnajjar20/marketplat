'use client';

/**
 * FIX SEC-4.3: CreateProductCategoryButton.tsx and
 * CreateServiceCategoryButton.tsx were identical apart from which
 * mutation hook they called and three strings (button label, dialog
 * title, slugify fallback prefix) — slugify itself was already
 * unified separately (FIX SEC-4.4, see lib/utils.ts). This generic
 * dialog is the shared implementation; the two call sites below just
 * supply what's actually different.
 *
 * CreateCategoryButton.tsx (ad categories) is intentionally NOT folded
 * into this — Category has no `icon` field, so this component's icon
 * input would need to become conditional for one caller that doesn't
 * use it at all. Not worth the extra branching for a single outlier.
 */

import { useState } from 'react';
import { Plus }     from 'lucide-react';
import { Button }   from '@/components/shared/ui/Button';
import { Input }    from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { toast }    from 'sonner';
import { slugify }  from '@/lib/utils';

interface CreateCategoryPayload {
  name: string;
  nameAr: string;
  slug: string;
  icon?: string;
}

export interface CreateEntityCategoryDialogProps {
  useCreateCategory: () => {
    mutate: (payload: CreateCategoryPayload, opts?: { onSuccess?: () => void }) => void;
    isPending: boolean;
  };
  /** e.g. 'product-category' — used as the slugify() fallback prefix. */
  slugFallbackPrefix: string;
  /** e.g. "فئة منتج جديدة" — shown on the trigger button and dialog title. */
  entityLabel: string;
  namePlaceholderAr: string;
  namePlaceholderEn: string;
  iconPlaceholder: string;
}

export function CreateEntityCategoryDialog({
  useCreateCategory,
  slugFallbackPrefix,
  entityLabel,
  namePlaceholderAr,
  namePlaceholderEn,
  iconPlaceholder,
}: CreateEntityCategoryDialogProps) {
  const [open,   setOpen]   = useState(false);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [icon,   setIcon]   = useState('');
  const createCategory = useCreateCategory();

  async function handleCreate() {
    if (!nameAr.trim()) { toast.error('الاسم بالعربي مطلوب'); return; }
    if (!nameEn.trim()) { toast.error('الاسم بالإنجليزي مطلوب'); return; }

    createCategory.mutate(
      {
        name: nameEn.trim(),
        nameAr: nameAr.trim(),
        slug: slugify(nameEn, slugFallbackPrefix),
        icon: icon.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setNameAr('');
          setNameEn('');
          setIcon('');
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {entityLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إنشاء {entityLabel}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالعربي <span className="text-destructive">*</span></label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={namePlaceholderAr} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالإنجليزي <span className="text-destructive">*</span></label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder={namePlaceholderEn} />
              {nameEn.trim() && (
                <p className="text-xs text-muted-foreground" dir="ltr">slug: {slugify(nameEn, slugFallbackPrefix)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">أيقونة <span className="text-muted-foreground">(اختياري)</span></label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} dir="ltr" placeholder={iconPlaceholder} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={handleCreate} disabled={createCategory.isPending}>
                {createCategory.isPending ? 'جارٍ الإنشاء…' : 'إنشاء'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
