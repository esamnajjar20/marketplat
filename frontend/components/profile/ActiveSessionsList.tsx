'use client';

import { useState } from 'react';
import { Monitor, Smartphone, Loader2 } from 'lucide-react';
import { Button }            from '@/components/shared/ui/Button';
import { Badge }             from '@/components/shared/ui/Badge';
import { LoadingSpinner }    from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog }     from '@/components/shared/feedback/ConfirmDialog';
import { useAuthSessions }   from '@/hooks/queries/useAuth';
import { useRevokeSession, useLogoutAll } from '@/hooks/mutations/useAuthMutations';
import { formatDate }        from '@/lib/formatters';

export function ActiveSessionsList() {
  const { data: sessions, isLoading } = useAuthSessions();
  const { mutate: revoke, isPending: revoking } = useRevokeSession();
  const { mutate: logoutAll, isPending: loggingOut } = useLogoutAll();
  const [confirmLogoutAllOpen, setConfirmLogoutAllOpen] = useState(false);

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  const list = sessions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">الجلسات النشطة</h2>
        <Button variant="destructive" size="sm" disabled={loggingOut}
          onClick={() => setConfirmLogoutAllOpen(true)}>
          {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تسجيل الخروج من الكل'}
        </Button>
      </div>

      <div className="space-y-3">
        {list.map((s) => (
          <div key={s.sessionId} className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              {s.userAgent?.includes('Mobile') || s.userAgent?.includes('Android') || s.userAgent?.includes('iPhone')
                ? <Smartphone className="h-5 w-5 text-muted-foreground" />
                : <Monitor className="h-5 w-5 text-muted-foreground" />}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate max-w-[200px]">{s.userAgent ?? 'جهاز غير معروف'}</p>
                  {s.isCurrent && <Badge variant="default" className="text-xs">الجلسة الحالية</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">IP: {s.ip} · آخر نشاط: {formatDate(s.lastSeen)}</p>
              </div>
            </div>
            {!s.isCurrent && (
              <Button variant="ghost" size="sm" disabled={revoking}
                onClick={() => revoke(s.sessionId)}>
                إنهاء
              </Button>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد جلسات نشطة</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmLogoutAllOpen}
        onOpenChange={setConfirmLogoutAllOpen}
        title="تسجيل الخروج من جميع الأجهزة؟"
        description="سيتم إنهاء جميع الجلسات النشطة، بما فيها هذه الجلسة."
        confirmLabel="تسجيل الخروج"
        destructive
        onConfirm={() => logoutAll()}
      />
    </div>
  );
}
