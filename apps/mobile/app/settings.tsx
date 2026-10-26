import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyProfile, updateNotificationPreferences } from '@/features/account/account.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

type PreferenceValue = boolean | string;
type Preferences = Record<string, PreferenceValue>;
const DEFAULT_PREFS: Preferences = {
  newMessage: true, adViews: false, favAdUpdated: true, promotions: false,
  myPromotions: true, savedSearch: true, storeUpdates: true, followUpdates: true,
  serviceQuotes: true, salesAlerts: true, lowStockAlerts: true,
  installmentAlerts: true, debtAlerts: true, weeklySalesReport: true,
  emailFallback: false, quietHoursEnabled: false, quietHoursStart: '22:00',
  quietHoursEnd: '08:00', quietHoursAllowUrgent: true, quietHoursTimeZone: 'Asia/Gaza',
};
const preferenceGroups: { title: string; rows: [string, string][] }[] = [
  { title: 'التواصل', rows: [['newMessage', 'الرسائل الجديدة']] },
  { title: 'المفضلة والبحث', rows: [['favAdUpdated', 'تحديثات الإعلانات المفضلة'], ['savedSearch', 'تنبيهات عمليات البحث المحفوظة']] },
  { title: 'المتاجر والعروض', rows: [['storeUpdates', 'تحديثات المتاجر التي أتابعها'], ['followUpdates', 'تحديثات الحسابات التي أتابعها'], ['myPromotions', 'عروضي الترويجية'], ['promotions', 'عروض وتخفيضات المنصة']] },
  { title: 'الخدمات', rows: [['serviceQuotes', 'عروض وطلبات الخدمات']] },
  { title: 'المبيعات والمخزون', rows: [['salesAlerts', 'تذكير المبيعات'], ['lowStockAlerts', 'تنبيهات انخفاض المخزون'], ['installmentAlerts', 'تنبيهات الأقساط المتأخرة'], ['debtAlerts', 'تنبيهات الديون'], ['weeklySalesReport', 'تقرير المبيعات الأسبوعي'], ['adViews', 'تقرير مشاهدات إعلاناتي']] },
];
function getDeviceTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}
function validTime(value: string): boolean { return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value); }
export default function SettingsScreen() {
  const { accessToken, csrfToken, logout, isBusy, user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const load = useCallback(async () => {
    if (!accessToken) { setLoadingPreferences(false); setPreferencesLoaded(false); return; }
    setLoadingPreferences(true); setPreferencesLoaded(false); setError(''); setMessage('');
    try {
      const profile = await fetchMyProfile(accessToken);
      const saved = profile.notificationPreferences ?? {};
      const merged: Preferences = { ...DEFAULT_PREFS };
      for (const key of Object.keys(DEFAULT_PREFS)) {
        const value = saved[key];
        if (typeof DEFAULT_PREFS[key] === 'boolean' && typeof value === 'boolean') merged[key] = value;
        if (typeof DEFAULT_PREFS[key] === 'string' && typeof value === 'string') merged[key] = value;
      }
      setPrefs(merged); setPreferencesLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الإعدادات. أعد المحاولة قبل الحفظ.');
    } finally { setLoadingPreferences(false); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const toggle = (key: string, value: boolean) => setPrefs((p) => ({ ...p, [key]: value }));
  const save = async () => {
    if (!accessToken || !preferencesLoaded || loadingPreferences) return;
    if (!validTime(String(prefs.quietHoursStart)) || !validTime(String(prefs.quietHoursEnd))) {
      setError('أدخل وقتًا صحيحًا بصيغة 24 ساعة مثل 22:00.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await updateNotificationPreferences(prefs, accessToken, csrfToken);
      setPrefs((current) => ({ ...current, ...(saved.notificationPreferences ?? {}) }));
      setMessage('تم حفظ تفضيلات الإشعارات.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات.'); }
    finally { setBusy(false); }
  };
  const confirmLogout = () => Alert.alert('تسجيل الخروج', 'سيتم إنهاء الجلسة المحلية والخروج من الحساب على هذا الجهاز.', [{ text: 'إلغاء', style: 'cancel' }, { text: 'تسجيل الخروج', style: 'destructive', onPress: () => { void logout().catch(() => undefined).finally(() => router.replace('/')); } }]);
  return <PageShell title="الإعدادات">
    {!accessToken ? <><Notice>سجّل الدخول لإدارة إعدادات الحساب.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : <>
      {loadingPreferences ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل تفضيلات الإشعارات…</Text></SectionCard> : null}
      {preferenceGroups.map((group) => <SectionCard key={group.title}><Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '800', color: colors.ink }}>{group.title}</Text>{group.rows.map(([key, label]) => <View key={key} style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, textAlign: 'right', color: colors.ink, fontSize: 14 }}>{label}</Text><Switch accessibilityLabel={label} disabled={!preferencesLoaded || busy} value={prefs[key] === true} onValueChange={(v) => toggle(key, v)} trackColor={{ true: colors.brand }} /></View>)}</SectionCard>)}
      <SectionCard><Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '800', color: colors.ink }}>البريد وساعات الهدوء</Text>
        {([['emailFallback', 'تنبيه بالبريد عند بقاء الإشعارات دون قراءة'], ['quietHoursEnabled', 'تفعيل ساعات الهدوء'], ['quietHoursAllowUrgent', 'السماح بالتنبيهات العاجلة أثناء الهدوء']] as [string, string][]).map(([key, label]) => <View key={key} style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, textAlign: 'right', color: colors.ink, fontSize: 14 }}>{label}</Text><Switch accessibilityLabel={label} disabled={!preferencesLoaded || busy} value={prefs[key] === true} onValueChange={(v) => toggle(key, v)} trackColor={{ true: colors.brand }} /></View>)}
        {prefs.quietHoursEnabled === true ? <>
          <Text style={{ textAlign: 'right', color: colors.ink, marginTop: 12 }}>بداية الهدوء (24 ساعة)</Text><TextInput accessibilityLabel="بداية الهدوء" value={String(prefs.quietHoursStart)} onChangeText={(v) => setPrefs((p) => ({ ...p, quietHoursStart: v }))} editable={preferencesLoaded && !busy} placeholder="22:00" keyboardType="numbers-and-punctuation" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, textAlign: 'right', color: colors.ink }} />
          <Text style={{ textAlign: 'right', color: colors.ink, marginTop: 12 }}>نهاية الهدوء (24 ساعة)</Text><TextInput accessibilityLabel="نهاية الهدوء" value={String(prefs.quietHoursEnd)} onChangeText={(v) => setPrefs((p) => ({ ...p, quietHoursEnd: v }))} editable={preferencesLoaded && !busy} placeholder="08:00" keyboardType="numbers-and-punctuation" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, textAlign: 'right', color: colors.ink }} />
          <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12, marginTop: 8 }}>المنطقة الزمنية: {String(prefs.quietHoursTimeZone || 'Asia/Gaza')}</Text>
          {deviceTimeZone && deviceTimeZone !== prefs.quietHoursTimeZone ? <PrimaryButton label={`استخدام توقيت الجهاز (${deviceTimeZone})`} variant="secondary" onPress={() => setPrefs((p) => ({ ...p, quietHoursTimeZone: deviceTimeZone }))} /> : null}
        </> : null}
        <PrimaryButton label="حفظ تفضيلات الإشعارات" onPress={() => void save()} busy={busy} disabled={!preferencesLoaded || loadingPreferences} />
        {!preferencesLoaded && !loadingPreferences ? <PrimaryButton label="إعادة تحميل التفضيلات" variant="secondary" onPress={() => void load()} /> : null}
      </SectionCard>
      <SectionCard><Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '800', color: colors.ink }}>الحساب والتطبيق</Text><PrimaryButton label="الصفحة الشخصية" variant="secondary" onPress={() => router.push('/profile')} /><PrimaryButton label="التخزين والبيانات المحلية" variant="secondary" onPress={() => router.push('/storage')} /><PrimaryButton label="إدارة العمليات دون اتصال" variant="secondary" onPress={() => router.push('/offline-queue')} /><PrimaryButton label="إدارة متجري" variant="secondary" onPress={() => router.push('/my-store')} /><PrimaryButton label="ملف مقدم الخدمة" variant="secondary" onPress={() => router.push('/service-provider-profile')} /><PrimaryButton label="تسجيل الخروج" variant="danger" busy={isBusy} onPress={confirmLogout} /></SectionCard>
      <Notice tone="muted">الحساب الحالي: {user?.email ?? 'مستخدم مسجل'}</Notice>
    </>}
    {message ? <Notice tone="success">{message}</Notice> : null}{error ? <Notice>{error}</Notice> : null}
  </PageShell>;
}
