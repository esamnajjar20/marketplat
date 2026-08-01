'use client';

/**
 * FEAT: admin bulk-notification broadcast.
 *
 * Backend POST /admin/notifications/broadcast (broadcastNotification
 * controller + notificationsService.broadcastPromotion) existed fully
 * server-side with zero frontend caller — no API function, no UI. This
 * component is that missing UI. Only exposes the "send to all active
 * users" path (allUsers: true) — the schema also supports targeting a
 * specific userIds list, but there's no admin screen for picking
 * individual recipients, so that path is left server-only for now.
 */
import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { toast } from 'sonner';
import { useAdminBroadcastNotification } from '@/hooks/mutations/useAdminMutations';

const TITLE_MAX = 200;
const BODY_MAX = 500;

export function BroadcastNotificationButton() {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const broadcast = useAdminBroadcastNotification();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTitle('');
      setBody('');
    }
  }

  function handleSubmit() {
    if (!title.trim()) { toast.error('عنوان الإشعار مطلوب'); return; }
    if (!body.trim()) { toast.error('نص الإشعار مطلوب'); return; }
    setConfirmOpen(true);
  }

  function handleConfirmSend() {
    broadcast.mutate(
      { title: title.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          handleOpenChange(false);
        },
        onError: () => setConfirmOpen(false),
      },
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4" /> إرسال إشعار جماعي
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>إرسال إشعار جماعي</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              سيصل هذا الإشعار إلى جميع المستخدمين النشطين على المنصة.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                العنوان <span className="text-destructive">*</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                placeholder="مثال: عرض خاص هذا الأسبوع"
                maxLength={TITLE_MAX}
              />
              <p className="text-xs text-muted-foreground text-end">{title.length}/{TITLE_MAX}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                نص الإشعار <span className="text-destructive">*</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                placeholder="اكتب نص الإشعار هنا…"
                maxLength={BODY_MAX}
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
              <p className="text-xs text-muted-foreground text-end">{body.length}/{BODY_MAX}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={broadcast.isPending}>
                {broadcast.isPending ? 'جارٍ الإرسال…' : 'إرسال'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد الإرسال"
        description="سيتم إرسال هذا الإشعار إلى جميع المستخدمين النشطين فوراً ولا يمكن التراجع عنه. هل تريد المتابعة؟"
        confirmLabel="إرسال للجميع"
        confirmingLabel="جارٍ الإرسال…"
        isPending={broadcast.isPending}
        onConfirm={handleConfirmSend}
      />
    </>
  );
}
