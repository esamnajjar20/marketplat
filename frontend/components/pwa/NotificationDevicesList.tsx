'use client';

/**
 * قائمة الأجهزة المسجَّلة للإشعارات الخارجية (Web Push + FCM):
 * عرض، إعادة تسمية، وحذف جهاز.
 *
 * - «هذا الجهاز» يُعرَّف بمقارنة بصمة محلية بالبصمة القادمة من الخادم
 *   (لا يصل الواجهة أي endpoint/token).
 * - حذف الجهاز الحالي غير متاح من هنا: المتصفح يبقى مشتركًا محليًا فيُعاد تسجيله
 *   في المزامنة التالية، لذا يُوجَّه المستخدم لزر «إيقاف» أعلاه.
 */

import { useEffect, useState } from 'react';
import { Check, Monitor, Pencil, Smartphone, Trash2, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { useNotificationDevices } from '@/hooks/queries/useNotificationDevices';
import {
  useRemoveNotificationDevice,
  useRenameNotificationDevice,
} from '@/hooks/mutations/useNotificationMutations';
import { getThisDeviceFingerprint } from '@/lib/runtime/deviceFingerprint';
import { formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { NotificationDevice } from '@/types/notification.types';

const MAX_LABEL = 60;

function fallbackLabel(d: NotificationDevice): string {
  if (d.label) return d.label;
  return d.kind === 'native' ? 'تطبيق الجوال' : 'متصفح';
}

export function NotificationDevicesList() {
  const { data: devices, isLoading, isError } = useNotificationDevices();
  const rename = useRenameNotificationDevice();
  const remove = useRemoveNotificationDevice();

  const [thisFingerprint, setThisFingerprint] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // يُعاد الحساب عند تغيّر القائمة: تفعيل/إيقاف هذا الجهاز يغيّر الاشتراك المحلي.
  useEffect(() => {
    let cancelled = false;
    void getThisDeviceFingerprint().then((fp) => {
      if (!cancelled) setThisFingerprint(fp);
    });
    return () => {
      cancelled = true;
    };
  }, [devices]);

  // الاشتراك الفارغ/الخطأ لا يستحقان واجهة: التبديل أعلاه يكفي.
  if (isLoading || isError || !devices || devices.length === 0) return null;

  const startEdit = (d: NotificationDevice) => {
    setConfirmId(null);
    setEditingId(d.id);
    setDraft(d.label ?? '');
  };

  const saveEdit = (d: NotificationDevice) => {
    const label = draft.trim();
    if (!label || label === d.label) {
      setEditingId(null);
      return;
    }
    rename.mutate(
      { kind: d.kind, id: d.id, label },
      { onSuccess: () => setEditingId(null) },
    );
  };

  return (
    <section aria-labelledby="notif-devices-heading" className="space-y-2">
      <h3 id="notif-devices-heading" className="text-sm font-medium">
        أجهزتك المسجّلة
        <span className="ms-1.5 text-xs font-normal text-muted-foreground">({devices.length})</span>
      </h3>

      <ul className="divide-y divide-border/70 rounded-xl border border-border/80">
        {devices.map((d) => {
          const isThis = thisFingerprint !== null && d.fingerprint === thisFingerprint;
          const isEditing = editingId === d.id;
          const isConfirming = confirmId === d.id;
          const Icon = d.kind === 'native' ? Smartphone : Monitor;

          return (
            <li key={`${d.kind}:${d.id}`} className="flex items-center gap-3 p-3">
              <Icon
                className={cn('h-5 w-5 shrink-0', isThis ? 'text-primary' : 'text-muted-foreground')}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit(d);
                    }}
                  >
                    <Input
                      autoFocus
                      value={draft}
                      maxLength={MAX_LABEL}
                      aria-label="اسم الجهاز"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-8"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={rename.isPending || draft.trim().length === 0}
                      aria-label="حفظ الاسم"
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      aria-label="إلغاء"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </form>
                ) : (
                  <>
                    <p className="flex flex-wrap items-center gap-x-2 truncate text-sm font-medium">
                      {fallbackLabel(d)}
                      {isThis && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          هذا الجهاز
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      آخر نشاط {formatRelativeTime(d.lastSeenAt)}
                    </p>
                  </>
                )}
              </div>

              {!isEditing && (
                <div className="flex shrink-0 items-center gap-1">
                  {isConfirming ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(
                            { kind: d.kind, id: d.id },
                            { onSettled: () => setConfirmId(null) },
                          )
                        }
                      >
                        تأكيد الحذف
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        تراجع
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(d)}
                        aria-label={`إعادة تسمية ${fallbackLabel(d)}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      {!isThis && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setConfirmId(d.id);
                          }}
                          aria-label={`حذف ${fallbackLabel(d)}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        حذف جهاز يوقف الإشعارات عليه فقط. لإيقافها على هذا الجهاز استخدم زر «إيقاف» أعلاه. يعود
        الجهاز المحذوف إلى القائمة إن فعّلت الإشعارات عليه من جديد.
      </p>
    </section>
  );
}
