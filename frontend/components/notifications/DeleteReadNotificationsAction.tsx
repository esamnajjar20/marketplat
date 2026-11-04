'use client';

import { memo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { Button } from '@/components/shared/ui/Button';
import { useDeleteAllReadNotifications } from '@/hooks/mutations/useNotificationMutations';

/** Keep dialog visibility and mutation-pending state out of the notifications list parent. */
export const DeleteReadNotificationsAction = memo(function DeleteReadNotificationsAction() {
  const [open, setOpen] = useState(false);
  const deleteAllRead = useDeleteAllReadNotifications();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={deleteAllRead.isPending}
        onClick={() => setOpen(true)}
        className="gap-1.5 text-muted-foreground"
      >
        <Trash2 className="h-3.5 w-3.5" />
        مسح المقروء
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="حذف كل الإشعارات المقروءة؟"
        description="سيتم حذف جميع الإشعارات المقروءة نهائياً. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        destructive
        isPending={deleteAllRead.isPending}
        onConfirm={() => {
          deleteAllRead.mutate(undefined, {
            onSettled: () => setOpen(false),
          });
        }}
      />
    </>
  );
});
