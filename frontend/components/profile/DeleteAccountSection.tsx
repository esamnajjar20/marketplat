'use client';

/**
 * FIX INTEG-08: usersApi.deleteMe() / backend DELETE /users/me were both
 * fully implemented and tested (usersService.deleteMe: deactivates the
 * user, cascades their ACTIVE ads to DELETED, revokes every refresh
 * token) but had no UI anywhere — see useUpdateProfile.ts's
 * useDeleteAccount. This is an irreversible, destructive action, so
 * unlike the lighter EditCategoryButton-style dialogs elsewhere it
 * requires typing a confirmation word rather than a single click —
 * matching the weight of what's actually happening (every active ad
 * disappears, every session everywhere is logged out).
 */
import { useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Input }  from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/shared/ui/Dialog';
import { useDeleteAccount } from '@/hooks/mutations/useUpdateProfile';

const CONFIRM_WORD = 'حذف';

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const deleteAccount = useDeleteAccount();

  function handleOpen() {
    setConfirmText('');
    setOpen(true);
  }

  function handleDelete() {
    if (confirmText !== CONFIRM_WORD) return;
    deleteAccount.mutate();
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <h2 className="font-semibold text-destructive">حذف الحساب</h2>
      <p className="text-sm text-muted-foreground">
        سيتم إلغاء تفعيل حسابك بشكل دائم وإخفاء جميع إعلاناتك النشطة، وسيتم
        تسجيل خروجك من جميع الأجهزة. لا يمكن التراجع عن هذا الإجراء.
      </p>
      <Button variant="destructive" onClick={handleOpen}>حذف حسابي</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>هل أنت متأكد من حذف حسابك؟</DialogTitle>
            <DialogDescription>
              هذا الإجراء نهائي ولا يمكن التراجع عنه. ستُخفى جميع إعلاناتك
              النشطة وستفقد الوصول إلى حسابك فوراً.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label htmlFor="confirm-delete" className="text-sm font-medium">
                اكتب <span className="font-mono font-bold">{CONFIRM_WORD}</span> للتأكيد
              </label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={confirmText !== CONFIRM_WORD || deleteAccount.isPending}
              >
                {deleteAccount.isPending ? 'جارٍ الحذف…' : 'حذف حسابي نهائياً'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
