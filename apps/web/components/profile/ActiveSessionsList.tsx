'use client';

import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Button }            from '@/components/shared/ui/Button';
import { Badge }             from '@/components/shared/ui/Badge';
import { LoadingSpinner }    from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog }     from '@/components/shared/feedback/ConfirmDialog';
import { useAuthSessions }   from '@/hooks/queries/useAuth';
import { useRevokeSession, useLogoutAll } from '@/hooks/mutations/useAuthMutations';
import { formatDate }        from '@/lib/formatters';

import { Spinner } from '@/components/ui/spinner';
/**
 * this used to render `IP: {s.ip}` in full — a
 * security screen leaking the exact network address of every
 * logged-in device to anyone who sees the tab, a screenshot, or a
 * screen-share. The backend only sends a raw `ip: string` (no
 * derived city/region field to show instead — see auth.types.ts),
 * so this masks the last octet/segment client-side rather than
 * hiding the field entirely: still enough for a user to recognize
 * "yes, that's my home network" vs. a genuinely unfamiliar one,
 * without exposing the full address to anyone glancing at the
 * screen. Handles both IPv4 (dotted) and IPv6 (colon) shapes.
 */
function maskIp(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.•••`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    if (parts.length >= 2) return `${parts.slice(0, 2).join(':')}:•••`;
  }
  return '•••';
}

export function ActiveSessionsList() {
  const { data: sessions, isLoading, isError, refetch } = useAuthSessions();
  // useRevokeSession's own isPending is shared across every
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

  // this is a security-relevant screen — telling a user
  // "لا توجد جلسات نشطة" (no active sessions) when the fetch actually
  // failed is worse than showing nothing, since it could read as
  // reassurance that no other device is logged in when the truth is
  // simply unknown.
  if (isError) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-xs">
        <p className="font-bold text-destructive">حدث خطأ أثناء تحميل الجلسات النشطة</p>
        <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl font-bold" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const list = sessions ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <p className="text-sm text-muted-foreground">الأجهزة المسجّل دخولك منها حاليًا.</p>

      <Button
        variant="outline"
        className="h-12 w-full rounded-xl border-destructive/30 font-bold text-destructive hover:bg-destructive/5"
        disabled={loggingOut}
        onClick={() => setConfirmLogoutAllOpen(true)}
      >
        {loggingOut ? <Spinner size="sm" /> : 'تسجيل الخروج من الكل'}
      </Button>

      <div className="space-y-2.5">
        {list.map((s) => {
          const isMobile =
            s.userAgent?.includes('Mobile') ||
            s.userAgent?.includes('Android') ||
            s.userAgent?.includes('iPhone');
          return (
            <div
              key={s.sessionId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-xs"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  {isMobile ? (
                    <Smartphone className="h-5 w-5" />
                  ) : (
                    <Monitor className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold break-words">{s.userAgent ?? 'جهاز غير معروف'}</p>
                    {s.isCurrent && (
                      <Badge variant="secondary" className="rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                        الجلسة الحالية
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground break-words">
                    IP: {maskIp(s.ip)} · آخر نشاط: {s.isCurrent ? 'الآن' : formatDate(s.lastSeen)}
                  </p>
                </div>
              </div>
              {!s.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 rounded-xl font-bold text-primary"
                  disabled={pendingSessionId === s.sessionId}
                  onClick={() => handleRevoke(s.sessionId)}
                >
                  {pendingSessionId === s.sessionId ? <Spinner size="sm" /> : 'إنهاء'}
                </Button>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد جلسات نشطة</p>
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
