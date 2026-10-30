import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchActiveSessions, revokeActiveSession, type ActiveSession } from '@/features/auth/sessions.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'غير متوفر';
}
export default function SessionsScreen() {
  const { accessToken, csrfToken } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!accessToken) { setError('سجّل الدخول لإدارة الجلسات.'); setLoading(false); return; }
    setLoading(true); setError('');
    try { setSessions(await fetchActiveSessions(accessToken)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الجلسات.'); }
    finally { setLoading(false); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const revoke = (session: ActiveSession) => {
    if (session.isCurrent) { Alert.alert('الجلسة الحالية', 'لا يمكن إنهاء الجلسة الحالية من هذه الشاشة. استخدم تسجيل الخروج.'); return; }
    Alert.alert('إنهاء الجلسة', 'سيتم إلغاء صلاحية هذا الجهاز في التجديد التالي للجلسة.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إنهاء الجلسة', style: 'destructive', onPress: () => {
        if (!accessToken || busyId) return;
        setBusyId(session.sessionId);
        void revokeActiveSession(session.sessionId, accessToken, csrfToken)
          .then(() => setSessions((items) => items.filter((item) => item.sessionId !== session.sessionId)))
          .catch((e) => Alert.alert('تعذر إنهاء الجلسة', e instanceof Error ? e.message : 'حاول مجددًا.'))
          .finally(() => setBusyId(''));
      } },
    ]);
  };
  return <PageShell title="الأجهزة والجلسات" right={<Pressable accessibilityRole="button" onPress={() => void load()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>تحديث</Text></Pressable>}>
    <Notice tone="muted">تعرض هذه القائمة الجلسات النشطة التي سجّلها الخادم. عنوان IP معروض بصيغته المحجوبة من الخادم.</Notice>
    {loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل الجلسات…</Text></SectionCard> : null}
    {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} /></SectionCard> : null}
    {!loading && !error && sessions.length === 0 ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>لا توجد جلسات نشطة مسجّلة.</Text></SectionCard> : null}
    {sessions.map((session) => <SectionCard key={session.sessionId}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '800', fontSize: 15 }}>{session.isCurrent ? 'هذا الجهاز · الجلسة الحالية' : 'جلسة نشطة أخرى'}</Text>
          <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12, lineHeight: 19 }}>{session.userAgent || 'جهاز غير معروف'}</Text>
          <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>عنوان IP: {session.ip || 'غير متوفر'}</Text>
          <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>تسجيل الدخول: {dateLabel(session.createdAt)}</Text>
          <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>آخر نشاط: {dateLabel(session.lastSeen)}</Text>
        </View>
        <View style={{ borderRadius: radius.pill, backgroundColor: session.isCurrent ? colors.successSoft : colors.brandSoft, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: colors.brand, fontSize: 11, fontWeight: '800' }}>{session.isCurrent ? 'حالي' : 'نشط'}</Text></View>
      </View>
      {!session.isCurrent ? <PrimaryButton label={busyId === session.sessionId ? 'جارٍ الإنهاء…' : 'إنهاء هذه الجلسة'} variant="danger" busy={busyId === session.sessionId} disabled={!!busyId} onPress={() => revoke(session)} /> : null}
    </SectionCard>)}
    <PrimaryButton label="العودة للإعدادات" variant="secondary" onPress={() => router.push('/settings')} />
  </PageShell>;
}
