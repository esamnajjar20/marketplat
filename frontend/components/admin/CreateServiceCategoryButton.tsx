'use client';

/**
 * CreateServiceCategoryButton — Epic 1.2.
 * Mirrors CreateCategoryButton.tsx exactly (same slugify helper, same
 * field layout, same validation), with one addition: an optional icon
 * field, since ServiceCategory (unlike the ad-side Category) has one.
 */

import { useState } from 'react';
import { Plus }     from 'lucide-react';
import { Button }   from '@/components/shared/ui/Button';
import { Input }    from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { toast }    from 'sonner';
import { useCreateServiceCategory } from '@/hooks/mutations/useServiceCategoryMutations';

/** Same as CreateCategoryButton's slugify — backend's
 * createServiceCategorySchema requires the identical /^[a-z0-9-]+$/ shape. */
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

export function CreateServiceCategoryButton() {
  const [open,   setOpen]   = useState(false);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [icon,   setIcon]   = useState('');
  const createCategory = useCreateServiceCategory();

  async function handleCreate() {
    if (!nameAr.trim()) { toast.error('الاسم بالعربي مطلوب'); return; }
    if (!nameEn.trim()) { toast.error('الاسم بالإنجليزي مطلوب'); return; }

    createCategory.mutate(
      {
        name: nameEn.trim(),
        nameAr: nameAr.trim(),
        slug: slugify(nameEn),
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
        <Plus className="h-4 w-4" /> فئة خدمة جديدة
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إنشاء فئة خدمة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالعربي <span className="text-destructive">*</span></label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="مثال: كهرباء" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالإنجليزي <span className="text-destructive">*</span></label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder="e.g. Electrical" />
              {nameEn.trim() && (
                <p className="text-xs text-muted-foreground" dir="ltr">slug: {slugify(nameEn)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">أيقونة <span className="text-muted-foreground">(اختياري)</span></label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} dir="ltr" placeholder="e.g. zap" />
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
