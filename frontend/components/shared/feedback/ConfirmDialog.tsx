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
}: ConfirmDialogProps) {
  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
