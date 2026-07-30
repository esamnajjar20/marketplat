'use client';

import { useState } from 'react';
import { Monitor, Smartphone, Loader2, AlertTriangle } from 'lucide-react';
import { Button }            from '@/components/shared/ui/Button';
import { Badge }             from '@/components/shared/ui/Badge';
import { LoadingSpinner }    from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog }     from '@/components/shared/feedback/ConfirmDialog';
import { useAuthSessions }   from '@/hooks/queries/useAuth';
import { useRevokeSession, useLogoutAll } from '@/hooks/mutations/useAuthMutations';
import { formatDate }        from '@/lib/formatters';

export function ActiveSessionsList() {
  const { data: sessions, isLoading, isError, refetch } = useAuthSessions();
  // UX-FIX P1-6: useRevokeSession's own isPending is shared across every
  // row (it's one mutation instance), so previously `disabled={revoking}`
  // disabled ALL rows' "إنهاء" buttons the instant any single one was
  // clicked. Track which specific session is in flight instead, so only
  // that row's button shows pending state.
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const { mutate: revoke } = useRevokeSession();
  const { mutate: logoutAll, isPending: loggingOut } = useLogoutAll();
  const [confirmLogoutAllOpen, setConfirmLogoutAllOpen] = useState(false);

  function handleRevoke(sessionId: string) {
    setPendingSessionId(sessionId);
    revoke(sessionId, { onSettled: () => setPendingSessionId(null) });
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  // UX-FIX P1-10: this is a security-relevant screen — telling a user
  // "لا توجد جلسات نشطة" (no active sessions) when the fetch actually
  // failed is worse than showing nothing, since it could read as
  // reassurance that no other device is logged in when the truth is
  // simply unknown.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل الجلسات النشطة</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

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
              <Button variant="ghost" size="sm" disabled={pendingSessionId === s.sessionId}
                onClick={() => handleRevoke(s.sessionId)}>
                {pendingSessionId === s.sessionId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنهاء'}
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
        isPending={loggingOut}
        onConfirm={() => logoutAll(undefined, { onSuccess: () => setConfirmLogoutAllOpen(false) })}
      />
    </div>
  );
}
