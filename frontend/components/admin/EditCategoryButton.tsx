'use client';

import { useState } from 'react';
import { Pencil }   from 'lucide-react';
import { Button }   from '@/components/shared/ui/Button';
import { Input }    from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { toast }    from 'sonner';
import { useUpdateCategory } from '@/hooks/mutations/useCategoryMutations';
import type { Category } from '@/types/category.types';

interface Props {
  category: Category;
}

/**
 * FIX INTEG-06: useUpdateCategory (useCategoryMutations.ts) and the
 * backend's PATCH /categories/:id were both fully implemented and
 * tested, but nothing in the admin UI ever called it — AdminCategoriesTree
 * was read-only. This wires the existing mutation to a real dialog,
 * following CreateCategoryButton's exact pattern (same slug-derivation
 * helper, same field layout) rather than introducing a new one.
 */
function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `category-${Date.now()}`;
}

export function EditCategoryButton({ category }: Props) {
  const [open,   setOpen]   = useState(false);
  const [nameAr, setNameAr] = useState(category.nameAr);
  const [nameEn, setNameEn] = useState(category.name);
  const updateCategory = useUpdateCategory(category.id);

  function handleOpen() {
    // Reset to the category's current values each time the dialog
    // opens, in case a previous edit was cancelled mid-way.
    setNameAr(category.nameAr);
    setNameEn(category.name);
    setOpen(true);
  }

  function handleSave() {
    if (!nameAr.trim()) { toast.error('الاسم بالعربي مطلوب'); return; }
    if (!nameEn.trim()) { toast.error('الاسم بالإنجليزي مطلوب'); return; }

    const patch: { name?: string; nameAr?: string; slug?: string } = {};
    if (nameAr.trim() !== category.nameAr) patch.nameAr = nameAr.trim();
    if (nameEn.trim() !== category.name) {
      patch.name = nameEn.trim();
      patch.slug = slugify(nameEn);
    }

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
          <DialogHeader><DialogTitle>تعديل الفئة</DialogTitle></DialogHeader>
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
