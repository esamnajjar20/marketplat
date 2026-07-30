'use client';

import { Button } from '@/components/shared/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/shared/ui/Dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the destructive (red) button style for irreversible actions like delete. */
  destructive?: boolean;
  onConfirm: () => void;
  /**
   * UX-FIX P1-3: pass the caller's mutation.isPending here. When provided,
   * the confirm button shows a loading label and is disabled while the
   * mutation is in flight, and the dialog does NOT auto-close on click —
   * previously it closed immediately regardless of the mutation's outcome,
   * so a failed delete looked identical to a successful one (the dialog
   * just vanished either way) and rapid Enter/Space presses could fire the
   * mutation multiple times before any response arrived.
   *
   * Callers should still close the dialog themselves (via onOpenChange)
   * from their mutation's onSuccess — see usage note below.
   */
  isPending?: boolean;
  confirmingLabel?: string;
}

/**
 * ConfirmDialog — a styled replacement for window.confirm().
 *
 * Usage pattern (controlled, so the same dialog works for any action):
 *   const [open, setOpen] = useState(false);
 *   const [target, setTarget] = useState<string | null>(null);
 *
 *   <Button onClick={() => { setTarget(ad.id); setOpen(true); }}>حذف</Button>
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="حذف الإعلان؟"
 *     description="لا يمكن التراجع عن هذا الإجراء."
 *     destructive
 *     onConfirm={() => target && deleteAd.mutate(target)}
 *   />
 *
 * UX-FIX P1-3 — with pending feedback, close the dialog yourself from
 * onSuccess instead of relying on auto-close:
 *   const deleteAd = useDeleteAd({ onSuccess: () => setOpen(false) });
 *   <ConfirmDialog
 *     ...
 *     isPending={deleteAd.isPending}
 *     onConfirm={() => target && deleteAd.mutate(target)}
 *   />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  destructive = false,
  onConfirm,
  isPending,
  confirmingLabel = 'جارٍ التنفيذ…',
}: ConfirmDialogProps) {
  // UX-FIX P1-3: `isPending` being provided at all (not just its value)
  // is the signal that the caller has opted into pending-aware behavior.
  // Callers that pass isPending are expected to close the dialog
  // themselves (via onOpenChange) once their mutation's onSuccess fires,
  // so the dialog only disappears on a real, confirmed outcome — not
  // immediately on click regardless of what happens next.
  const isPendingAware = isPending !== undefined;

  function handleConfirm() {
    onConfirm();
    if (!isPendingAware) {
      onOpenChange(false);
    }
  }

  // Prevent closing (via Escape, overlay click, or the cancel button)
  // while a pending-aware mutation is in flight, so the user can't lose
  // track of an action that's still running on the server.
  function handleOpenChange(next: boolean) {
    if (isPending) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? confirmingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
