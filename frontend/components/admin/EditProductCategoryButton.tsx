'use client';

/**
 * EditProductCategoryButton.
 * Mirrors EditServiceCategoryButton.tsx's exact pattern (same slugify
 * helper, same dialog layout, same diff-before-mutate approach).
 */

import { useState } from 'react';
import { Pencil }   from 'lucide-react';
import { Button }   from '@/components/shared/ui/Button';
import { Input }    from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { toast }    from 'sonner';
import { useUpdateProductCategory } from '@/hooks/mutations/useProductCategoryMutations';
import type { ProductCategory } from '@/types/product.types';

interface Props {
  category: ProductCategory;
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `product-category-${Date.now()}`;
}

export function EditProductCategoryButton({ category }: Props) {
  const [open,   setOpen]   = useState(false);
  const [nameAr, setNameAr] = useState(category.nameAr);
  const [nameEn, setNameEn] = useState(category.name);
  const [icon,   setIcon]   = useState(category.icon ?? '');
  const updateCategory = useUpdateProductCategory(category.id);

  function handleOpen() {
    // Reset to the category's current values each time the dialog
    // opens, in case a previous edit was cancelled mid-way — same
    // reasoning as EditServiceCategoryButton's handleOpen.
    setNameAr(category.nameAr);
    setNameEn(category.name);
    setIcon(category.icon ?? '');
    setOpen(true);
  }

  function handleSave() {
    if (!nameAr.trim()) { toast.error('الاسم بالعربي مطلوب'); return; }
    if (!nameEn.trim()) { toast.error('الاسم بالإنجليزي مطلوب'); return; }

    const patch: { name?: string; nameAr?: string; slug?: string; icon?: string } = {};
    if (nameAr.trim() !== category.nameAr) patch.nameAr = nameAr.trim();
    if (nameEn.trim() !== category.name) {
      patch.name = nameEn.trim();
      patch.slug = slugify(nameEn);
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
          <DialogHeader><DialogTitle>تعديل فئة المنتج</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالعربي <span className="text-destructive">*</span></label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="مثال: إلكترونيات" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالإنجليزي <span className="text-destructive">*</span></label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder="e.g. Electronics" />
              {nameEn.trim() && nameEn.trim() !== category.name && (
                <p className="text-xs text-muted-foreground" dir="ltr">slug: {slugify(nameEn)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">أيقونة <span className="text-muted-foreground">(اختياري)</span></label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} dir="ltr" placeholder="e.g. cpu" />
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
