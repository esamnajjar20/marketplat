'use client';

/**
 * FIX SEC-4.3: EditProductCategoryButton.tsx and
 * EditServiceCategoryButton.tsx were identical apart from which
 * mutation hook they called, three strings (dialog title, slugify
 * fallback prefix, placeholders), and the category type. This generic
 * dialog is the shared implementation; the two call sites below just
 * supply what's actually different.
 *
 * EditCategoryButton.tsx (ad categories) is intentionally NOT folded
 * into this, for the same reason CreateCategoryButton.tsx isn't —
 * Category has no `icon` field.
 */import { useState } from 'react';
import { Pencil }   from 'lucide-react';
import { Button }   from '@/components/shared/ui/Button';
import { Input }    from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { toast }    from 'sonner';
import { slugify }  from '@/lib/utils';
import { useResettableDialog } from '@/hooks/useResettableDialog';

interface EditableCategory {
  id: string;
  name: string;
  nameAr: string;
  icon: string | null;
}

interface UpdateCategoryPatch {
  name?: string;
  nameAr?: string;
  slug?: string;
  icon?: string;
}

export interface EditEntityCategoryDialogProps<TCategory extends EditableCategory> {
  category: TCategory;
  useUpdateCategory: (id: string) => {
    mutate: (patch: UpdateCategoryPatch, opts?: { onSuccess?: () => void }) => void;
    isPending: boolean;
  };
  /** e.g. 'product-category' — used as the slugify() fallback prefix. */
  slugFallbackPrefix: string;
  /** e.g. "تعديل فئة المنتج" — shown as the dialog title. */
  dialogTitle: string;
  namePlaceholderAr: string;
  namePlaceholderEn: string;
  iconPlaceholder: string;
}

export function EditEntityCategoryDialog<TCategory extends EditableCategory>({
  category,
  useUpdateCategory,
  slugFallbackPrefix,
  dialogTitle,
  namePlaceholderAr,
  namePlaceholderEn,
  iconPlaceholder,
}: EditEntityCategoryDialogProps<TCategory>) {
  const [nameAr, setNameAr] = useState(category.nameAr);
  const [nameEn, setNameEn] = useState(category.name);
  const [icon,   setIcon]   = useState(category.icon ?? '');
  const updateCategory = useUpdateCategory(category.id);

  // AUDIT-FIX (issue #7.1): reset-on-open sequencing lives in one shared
  // hook instead of being hand-rolled per dialog — see useResettableDialog's
  // own doc comment for why this used to be copy-pasted three times.
  const { open, setOpen, handleOpen } = useResettableDialog(() => {
    setNameAr(category.nameAr);
    setNameEn(category.name);
    setIcon(category.icon ?? '');
  });

  function handleSave() {
    if (!nameAr.trim()) { toast.error('الاسم بالعربي مطلوب'); return; }
    if (!nameEn.trim()) { toast.error('الاسم بالإنجليزي مطلوب'); return; }

    const patch: UpdateCategoryPatch = {};
    if (nameAr.trim() !== category.nameAr) patch.nameAr = nameAr.trim();
    if (nameEn.trim() !== category.name) {
      patch.name = nameEn.trim();
      patch.slug = slugify(nameEn, slugFallbackPrefix);
    }
    if (icon.trim() !== (category.icon ?? '')) patch.icon = icon.trim();

    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }

    updateCategory.mutate(patch, {
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label={`تعديل ${category.nameAr}`}
        onClick={(e) => { e.stopPropagation(); handleOpen(); }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالعربي <span className="text-destructive">*</span></label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={namePlaceholderAr} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالإنجليزي <span className="text-destructive">*</span></label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder={namePlaceholderEn} />
              {nameEn.trim() && nameEn.trim() !== category.name && (
                <p className="text-xs text-muted-foreground" dir="ltr">slug: {slugify(nameEn, slugFallbackPrefix)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">أيقونة <span className="text-muted-foreground">(اختياري)</span></label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} dir="ltr" placeholder={iconPlaceholder} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={handleSave} disabled={updateCategory.isPending}>
                {updateCategory.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
