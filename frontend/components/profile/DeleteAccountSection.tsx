'use client';

/**
 * usersApi.deleteMe() / backend POST /users/me/delete-confirmed are
 * implemented with password re-authentication (usersService.deleteMe: deactivates the
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
  const [currentPassword, setCurrentPassword] = useState('');
  const deleteAccount = useDeleteAccount();

  function handleOpen() {
    setConfirmText('');
    setCurrentPassword('');
    setOpen(true);
  }

  function handleDelete() {
    if (confirmText !== CONFIRM_WORD || !currentPassword.trim()) return;
    deleteAccount.mutate(currentPassword);
  }

  // block Escape / overlay-click / cancel-button close while
  // the delete request is in flight. Previously the raw Dialog's
  // onOpenChange={setOpen} let the user close the dialog mid-request; the
  // request kept running in the background with no visible success/error
  // path once the dialog was gone. Mirrors ConfirmDialog's handleOpenChange.
  function handleOpenChange(next: boolean) {
    if (deleteAccount.isPending) return;
    setOpen(next);
    if (!next) {
      setConfirmText('');
      setCurrentPassword('');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-5 md:p-6">
      <h2 className="flex items-center justify-end gap-2 text-base font-bold text-destructive">
        حذف الحساب
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-sm" aria-hidden>
          ⚠
        </span>
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        سيتم إلغاء تفعيل حسابك بشكل دائم وإخفاء جميع إعلاناتك النشطة، وسيتم
        تسجيل خروجك من جميع الأجهزة. لا يمكن التراجع عن هذا الإجراء.
      </p>
      <div className="flex justify-start">
        <Button variant="destructive" className="rounded-xl font-bold" onClick={handleOpen}>
          حذف حسابي
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start">
              هل أنت متأكد من حذف حسابك؟
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive" aria-hidden>
                ⚠
              </span>
            </DialogTitle>
            <DialogDescription className="text-start leading-relaxed">
              هذا الإجراء نهائي ولا يمكن التراجع عنه. ستُخفى جميع إعلاناتك
              النشطة وستفقد الوصول إلى حسابك فوراً.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label htmlFor="delete-current-password" className="text-sm font-medium">
                كلمة المرور الحالية لإعادة تأكيد هويتك
              </label>
              <Input
                id="delete-current-password"
                type="password"
                autoComplete="current-password"
                className="h-11 rounded-xl"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="كلمة المرور الحالية"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm-delete" className="text-sm font-medium">
                اكتب <span className="font-bold">{CONFIRM_WORD}</span> للتأكيد
              </label>
              <Input
                id="confirm-delete"
                className="h-11 rounded-xl border-destructive/40"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-xl font-bold"
                onClick={() => handleOpenChange(false)}
                disabled={deleteAccount.isPending}
              >
                إلغاء
              </Button>
              <Button
                variant="destructive"
                className="h-11 flex-1 rounded-xl font-bold"
                onClick={handleDelete}
                disabled={confirmText !== CONFIRM_WORD || !currentPassword.trim()}
                loading={deleteAccount.isPending}
                loadingText="جارٍ الحذف…"
              >
                حذف حسابي نهائياً
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
