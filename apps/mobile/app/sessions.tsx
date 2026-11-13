import { useAppTheme } from '@/theme/ThemeProvider';
import { formatDate } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchActiveSessions, revokeActiveSession, type ActiveSession } from '@/features/auth/sessions.api';
import { Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { PageList } from '@/components/ui/PageList';
import { fontSizes, radius, spacing, typography, fontWeights } from '@/theme/tokens';
import { showToast } from '@/lib/toast';
import { useAsyncResource } from '@/hooks/useAsyncResource';

const EMPTY_SESSIONS: ActiveSession[] = [];

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatDate(date) : 'غير متوفر';
}
const SessionRow = memo(function SessionRow({ session, busyId, onRevoke }: { session: ActiveSession; busyId: string; onRevoke: (session: ActiveSession) => void }) {
  const { colors } = useAppTheme();
  return <SectionCard>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text tone="ink" strong size={15}>{session.isCurrent ? 'هذا الجهاز · الجلسة الحالية' : 'جلسة نشطة أخرى'}</Text>
        <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[12], lineHeight: 19 }}>{session.userAgent || 'جهاز غير معروف'}</Text>
        <Text tone="muted" size={12}>عنوان IP: {session.ip || 'غير متوفر'}</Text>
        <Text tone="muted" size={12}>تسجيل الدخول: {dateLabel(session.createdAt)}</Text>
        <Text tone="muted" size={12}>آخر نشاط: {dateLabel(session.lastSeen)}</Text>
      </View>
      <View style={{ borderRadius: radius.pill, backgroundColor: session.isCurrent ? colors.successSoft : colors.brandSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}><Text style={{ color: colors.brand, fontSize: fontSizes[11], fontWeight: fontWeights.bold }}>{session.isCurrent ? 'حالي' : 'نشط'}</Text></View>
    </View>
    {!session.isCurrent ? <PrimaryButton label={busyId === session.sessionId ? 'جارٍ الإنهاء…' : 'إنهاء هذه الجلسة'} variant="danger" busy={busyId === session.sessionId} disabled={!!busyId} onPress={() => onRevoke(session)} /> : null}
  </SectionCard>;
});

const sessionKey = (session: ActiveSession) => session.sessionId;

export default function SessionsScreen() {
  const { colors } = useAppTheme();

  const { accessToken, csrfToken } = useAuth();
  const [busyId, setBusyId] = useState('');
  const resource = useAsyncResource<ActiveSession[]>(
    () => fetchActiveSessions(accessToken as string),
    {
      key: accessToken ? '1' : '0',
      manual: !accessToken,
      tag: 'sessions',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الجلسات.'),
    },
  );
  const { loading, setData: setSessionsData } = resource;
  const sessions = resource.data ?? EMPTY_SESSIONS;
  const error = !accessToken ? 'سجّل الدخول لإدارة الجلسات.' : resource.error ?? '';
  const load = resource.reload;
  const revoke = (session: ActiveSession) => {
    if (session.isCurrent) { showToast('الجلسة الحالية', 'لا يمكن إنهاء الجلسة الحالية من هذه الشاشة. استخدم تسجيل الخروج.', 'error'); return; }
    confirmAlert('إنهاء الجلسة', 'سيتم إلغاء صلاحية هذا الجهاز في التجديد التالي للجلسة.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إنهاء الجلسة', style: 'destructive', onPress: () => {
        if (!accessToken || busyId) return;
        setBusyId(session.sessionId);
        void revokeActiveSession(session.sessionId, accessToken, csrfToken)
          .then(() => setSessionsData((items) => (items ? items.filter((item) => item.sessionId !== session.sessionId) : items)))
          .catch((e) => showToast('تعذر إنهاء الجلسة', e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error'))
          .finally(() => setBusyId(''));
      } },
    ]);
  };
  const renderItem = ({ item }: { item: ActiveSession }) => <SessionRow session={item} busyId={busyId} onRevoke={revoke} />;
  const header = <>
    <Notice tone="muted">تعرض هذه القائمة الجلسات النشطة التي سجّلها الخادم. عنوان IP معروض بصيغته المحجوبة من الخادم.</Notice>
    {loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل الجلسات…</Text></SectionCard> : null}
    {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} /></SectionCard> : null}
    {!loading && !error && sessions.length === 0 ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>لا توجد جلسات نشطة مسجّلة.</Text></SectionCard> : null}
  </>;
  const footer = <PrimaryButton label="العودة للإعدادات" variant="secondary" onPress={() => pushOnce('/settings')} />;
  return <PageList
    title="الأجهزة والجلسات"
    right={<Pressable accessibilityRole="button" onPress={() => void load()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>تحديث</Text></Pressable>}
    data={sessions}
    keyExtractor={sessionKey}
    renderItem={renderItem}
    extraData={busyId}
    header={header}
    footer={footer}
  />;
}
