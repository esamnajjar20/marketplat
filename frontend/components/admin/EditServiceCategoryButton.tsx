'use client';

/**
 * EditServiceCategoryButton — Epic 1.2.
 * Mirrors EditCategoryButton.tsx's exact pattern (same slugify helper,
 * same dialog layout, same diff-before-mutate approach), with one
 * addition: an icon field, since ServiceCategory has one and the ad
 * Category doesn't. The reset-on-open sequencing itself now lives in
 * useResettableDialog (issue #7.1) rather than being copy-pasted here.
 */

import { useState } from 'react';
import { Pencil }   from 'lucide-react';
import { Button }   from '@/components/shared/ui/Button';
import { Input }    from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { toast }    from 'sonner';
import { useUpdateServiceCategory } from '@/hooks/mutations/useServiceCategoryMutations';
import { useResettableDialog } from '@/hooks/useResettableDialog';
import type { ServiceCategory } from '@/types/service.types';

interface Props {
  category: ServiceCategory;
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `service-category-${Date.now()}`;
}

export function EditServiceCategoryButton({ category }: Props) {
  const [nameAr, setNameAr] = useState(category.nameAr);
  const [nameEn, setNameEn] = useState(category.name);
  const [icon,   setIcon]   = useState(category.icon ?? '');
  const updateCategory = useUpdateServiceCategory(category.id);

  const { open, setOpen, handleOpen } = useResettableDialog(() => {
    setNameAr(category.nameAr);
    setNameEn(category.name);
    setIcon(category.icon ?? '');
  });

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
          <DialogHeader><DialogTitle>تعديل فئة الخدمة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالعربي <span className="text-destructive">*</span></label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="مثال: كهرباء" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالإنجليزي <span className="text-destructive">*</span></label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder="e.g. Electrical" />
              {nameEn.trim() && nameEn.trim() !== category.name && (
                <p className="text-xs text-muted-foreground" dir="ltr">slug: {slugify(nameEn)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">أيقونة <span className="text-muted-foreground">(اختياري)</span></label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} dir="ltr" placeholder="e.g. zap" />
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
