'use client';

import { useState } from 'react';
import { Plus }     from 'lucide-react';
import { Button }   from '@/components/shared/ui/Button';
import { Input }    from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { toast }    from 'sonner';
import { useCreateCategory } from '@/hooks/mutations/useCategoryMutations';
import { slugify } from '@/lib/utils';

export function CreateCategoryButton() {
  const [open,    setOpen]    = useState(false);
  const [nameAr,  setNameAr]  = useState('');
  const [nameEn,  setNameEn]  = useState('');
  const createCategory = useCreateCategory();

  async function handleCreate() {
    if (!nameAr.trim()) { toast.error('الاسم بالعربي مطلوب'); return; }
    if (!nameEn.trim()) { toast.error('الاسم بالإنجليزي مطلوب'); return; }

    // FIX FEAT-03: previously a fake `setTimeout` placeholder — now
    // calls the real, already-existing POST /categories endpoint.
    createCategory.mutate(
      { name: nameEn.trim(), nameAr: nameAr.trim(), slug: slugify(nameEn, 'category') },
      {
        onSuccess: () => {
          setOpen(false);
          setNameAr('');
          setNameEn('');
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> فئة جديدة
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إنشاء فئة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالعربي <span className="text-destructive">*</span></label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="مثال: إلكترونيات" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم بالإنجليزي <span className="text-destructive">*</span></label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder="e.g. Electronics" />
              {nameEn.trim() && (
                <p className="text-xs text-muted-foreground" dir="ltr">slug: {slugify(nameEn, 'category')}</p>
              )}
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
