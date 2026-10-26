import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyProfile, updateNotificationPreferences } from '@/features/account/account.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';
const preferenceRows: [string, string][] = [['newMessage','الرسائل الجديدة'],['adViews','مشاهدات الإعلانات'],['favAdUpdated','تحديثات الإعلانات المفضلة'],['promotions','عروض السوق والتخفيضات'],['savedSearch','عمليات البحث المحفوظة'],['storeUpdates','تحديثات المتاجر'],['followUpdates','تحديثات الحسابات التي أتابعها'],['serviceQuotes','عروض الخدمات'],['salesAlerts','تنبيهات المبيعات'],['lowStockAlerts','تنبيهات انخفاض المخزون']];
export default function SettingsScreen() {
  const { accessToken, csrfToken, logout, isBusy, user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(async () => { if (!accessToken) return; try { const profile = await fetchMyProfile(accessToken); const saved = profile.notificationPreferences ?? {}; setPrefs(Object.fromEntries(preferenceRows.map(([key]) => [key, typeof saved[key] === 'boolean' ? saved[key] : true]))); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الإعدادات.'); } }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const toggle = (key: string, value: boolean) => setPrefs((p) => ({ ...p, [key]: value }));
  const save = async () => { if (!accessToken) return; setBusy(true); setError(''); setMessage(''); try { const saved = await updateNotificationPreferences(prefs, accessToken, csrfToken); setPrefs((p) => ({ ...p, ...(saved.notificationPreferences ?? {}) })); setMessage('تم حفظ تفضيلات الإشعارات على الحساب.'); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات.'); } finally { setBusy(false); } };
  const confirmLogout = () => Alert.alert('تسجيل الخروج', 'سيتم إنهاء الجلسة المحلية والخروج من الحساب على هذا الجهاز.', [{ text: 'إلغاء', style: 'cancel' }, { text: 'تسجيل الخروج', style: 'destructive', onPress: () => { void logout().catch(() => undefined).finally(() => router.replace('/')); } }]);
  return <PageShell title="الإعدادات">
    {!accessToken ? <><Notice>سجّل الدخول لإدارة إعدادات الحساب.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : <>
      <SectionCard><Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '800', color: colors.ink }}>الإشعارات</Text><Text style={{ textAlign: 'right', fontSize: 12, color: colors.muted }}>تُحمّل التفضيلات المحفوظة من الخادم وتُحفظ عند الضغط على الزر.</Text>{preferenceRows.map(([key, label]) => <View key={key} style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, textAlign: 'right', color: colors.ink, fontSize: 14 }}>{label}</Text><Switch accessibilityLabel={label} value={prefs[key] ?? true} onValueChange={(v) => toggle(key, v)} trackColor={{ true: colors.brand }} /></View>)}<PrimaryButton label="حفظ الإعدادات" onPress={() => void save()} busy={busy} /></SectionCard>
      <SectionCard><Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '800', color: colors.ink }}>الحساب والتطبيق</Text><PrimaryButton label="الصفحة الشخصية" variant="secondary" onPress={() => router.push('/profile')} /><PrimaryButton label="التخزين والبيانات المحلية" variant="secondary" onPress={() => router.push('/storage')} /><PrimaryButton label="إدارة العمليات دون اتصال" variant="secondary" onPress={() => router.push('/offline-queue')} /><PrimaryButton label="إدارة متجري" variant="secondary" onPress={() => router.push('/my-store')} /><PrimaryButton label="ملف مقدم الخدمة" variant="secondary" onPress={() => router.push('/service-provider-profile')} /><PrimaryButton label="تسجيل الخروج" variant="danger" busy={isBusy} onPress={confirmLogout} /></SectionCard>
      <Notice tone="muted">الحساب الحالي: {user?.email ?? 'مستخدم مسجل'}</Notice>
    </>}
    {message ? <Notice tone="success">{message}</Notice> : null}{error ? <Notice>{error}</Notice> : null}
  </PageShell>;
}
