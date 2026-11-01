import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { getConfiguredWebUrl } from '@/lib/web-links';
import { fetchMyProfile, updateNotificationPreferences } from '@/features/account/account.api';
import { ListRow, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, colors } from '@/theme/tokens';
import { AccountSecuritySection } from '@/components/ui/AccountSecuritySection';

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
  const { accessToken, getAccessToken, csrfToken, logout, isBusy, user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setLoadingPreferences(false); setPreferencesLoaded(false); return; }
    setLoadingPreferences(true); setPreferencesLoaded(false); setError(''); setMessage('');
    try {
      const profile = await fetchMyProfile(token, user?.id);
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
  }, [getAccessToken, user?.id]);
  useEffect(() => { void load(); }, [load]);
  const toggle = (key: string, value: boolean) => setPrefs((p) => ({ ...p, [key]: value }));
  const save = async () => {
    if (!accessToken || !preferencesLoaded || loadingPreferences) return;
    if (!validTime(String(prefs.quietHoursStart)) || !validTime(String(prefs.quietHoursEnd))) {
      setError('أدخل وقتًا صحيحًا بصيغة 24 ساعة مثل 22:00.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const token = getAccessToken();
      if (!token) { router.push('/login'); return; }
      const saved = await updateNotificationPreferences(prefs, token, csrfToken, user?.id);
      setPrefs((current) => ({ ...current, ...(saved.notificationPreferences ?? {}) }));
      setMessage('تم حفظ تفضيلات الإشعارات.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات.'); }
    finally { setBusy(false); }
  };
  const handleLogout = async () => {
    try {
      const result = await logout(); // AuthContext lets the user keep or explicitly delete encrypted local data.
      if (result === 'done') router.replace('/');
    } catch { setError('تعذر إكمال تسجيل الخروج. لم يتم تأكيد العملية.'); }
  };
  return <PageShell title="الإعدادات">
    {!accessToken ? <><Notice>سجّل الدخول لإدارة إعدادات الحساب.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : <>
      {loadingPreferences ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل تفضيلات الإشعارات…</Text></SectionCard> : null}
      {preferenceGroups.map((group) => <SectionCard key={group.title}><Text style={{ textAlign: 'right', fontSize: fontSizes[16], fontWeight: '800', color: colors.ink }}>{group.title}</Text>{group.rows.map(([key, label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, textAlign: 'right', color: colors.ink, fontSize: fontSizes[14] }}>{label}</Text><Switch accessibilityLabel={label} disabled={!preferencesLoaded || busy} value={prefs[key] === true} onValueChange={(v) => toggle(key, v)} trackColor={{ true: colors.brand }} /></View>)}</SectionCard>)}
      <SectionCard><Text style={{ textAlign: 'right', fontSize: fontSizes[16], fontWeight: '800', color: colors.ink }}>البريد وساعات الهدوء</Text>
        {([['emailFallback', 'تنبيه بالبريد عند بقاء الإشعارات دون قراءة'], ['quietHoursEnabled', 'تفعيل ساعات الهدوء'], ['quietHoursAllowUrgent', 'السماح بالتنبيهات العاجلة أثناء الهدوء']] as [string, string][]).map(([key, label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, textAlign: 'right', color: colors.ink, fontSize: fontSizes[14] }}>{label}</Text><Switch accessibilityLabel={label} disabled={!preferencesLoaded || busy} value={prefs[key] === true} onValueChange={(v) => toggle(key, v)} trackColor={{ true: colors.brand }} /></View>)}
        {prefs.quietHoursEnabled === true ? <>
          <Text style={{ textAlign: 'right', color: colors.ink, marginTop: 12 }}>بداية الهدوء (24 ساعة)</Text><TextInput allowFontScaling accessibilityLabel="بداية الهدوء" maxFontSizeMultiplier={1.3} value={String(prefs.quietHoursStart)} onChangeText={(v) => setPrefs((p) => ({ ...p, quietHoursStart: v }))} editable={preferencesLoaded && !busy} placeholder="22:00" keyboardType="numbers-and-punctuation" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, minHeight: 52, textAlign: 'right', color: colors.ink }} />
          <Text style={{ textAlign: 'right', color: colors.ink, marginTop: 12 }}>نهاية الهدوء (24 ساعة)</Text><TextInput allowFontScaling accessibilityLabel="نهاية الهدوء" maxFontSizeMultiplier={1.3} value={String(prefs.quietHoursEnd)} onChangeText={(v) => setPrefs((p) => ({ ...p, quietHoursEnd: v }))} editable={preferencesLoaded && !busy} placeholder="08:00" keyboardType="numbers-and-punctuation" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, textAlign: 'right', color: colors.ink }} />
          <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[12], marginTop: 8 }}>المنطقة الزمنية: {String(prefs.quietHoursTimeZone || 'Asia/Gaza')}</Text>
          {deviceTimeZone && deviceTimeZone !== prefs.quietHoursTimeZone ? <PrimaryButton label={`استخدام توقيت الجهاز (${deviceTimeZone})`} variant="secondary" onPress={() => setPrefs((p) => ({ ...p, quietHoursTimeZone: deviceTimeZone }))} /> : null}
        </> : null}
        <PrimaryButton label="حفظ تفضيلات الإشعارات" onPress={() => void save()} busy={busy} disabled={!preferencesLoaded || loadingPreferences} />
        {!preferencesLoaded && !loadingPreferences ? <PrimaryButton label="إعادة تحميل التفضيلات" variant="secondary" onPress={() => void load()} /> : null}
      </SectionCard>
      <SectionCard>
        <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '800', color: colors.ink }}>بيانات التطبيق على هذا الجهاز</Text>
        <ListRow title="المحتوى المحفوظ دون اتصال" description="العناصر التي حفظتها للرجوع إليها بلا إنترنت" glyph="◇" onPress={() => router.push('/saved-offline')} />
        <ListRow title="إدارة متجري" description="تحديث معلومات المتجر ومتابعة المنتجات" glyph="▦" onPress={() => router.push('/my-store')} />
        <ListRow title="المستخدمون المحظورون" description="مراجعة الحسابات التي حظرتها وإدارة قائمة الحظر" glyph="⊘" onPress={() => router.push('/blocked-users')} />
        <ListRow title="بلاغاتي" description="متابعة حالة البلاغات التي أرسلتها" glyph="⚑" onPress={() => router.push('/my-reports')} />
        <ListRow title="التخزين والبيانات المحلية" description="إدارة مساحة التخزين والبيانات المشفرة" glyph="▣" onPress={() => router.push('/storage')} />
        <ListRow title="العمليات بانتظار المزامنة" description="راجع الطلبات والرسائل التي تنتظر الاتصال" glyph="↻" onPress={() => router.push('/offline-queue')} />
      </SectionCard>
      <SectionCard>
        <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '800', color: colors.ink }}>المساعدة والمعلومات</Text>
        <ListRow title="سياسة الخصوصية" glyph="؟" onPress={() => { void Linking.openURL(getConfiguredWebUrl('/privacy')).catch(() => Alert.alert('تعذر فتح الرابط', 'افتح الموقع الرسمي من المتصفح.')); }} />
        <ListRow title="الشروط والأحكام" glyph="؟" onPress={() => { void Linking.openURL(getConfiguredWebUrl('/terms')).catch(() => Alert.alert('تعذر فتح الرابط', 'افتح الموقع الرسمي من المتصفح.')); }} />
        <ListRow title="اتصل بنا" glyph="✉" onPress={() => { void Linking.openURL(getConfiguredWebUrl('/contact')).catch(() => Alert.alert('تعذر فتح الرابط', 'افتح الموقع الرسمي من المتصفح.')); }} />
        <ListRow title="من نحن" glyph="i" onPress={() => { void Linking.openURL(getConfiguredWebUrl('/about')).catch(() => Alert.alert('تعذر فتح الرابط', 'افتح الموقع الرسمي من المتصفح.')); }} />
      </SectionCard>
      <PrimaryButton label="تسجيل الخروج" variant="danger" busy={isBusy} onPress={() => void handleLogout()} />
      <AccountSecuritySection />
      <Notice tone="muted">الحساب الحالي: {user?.email ?? 'مستخدم مسجل'}</Notice>
    </>}
    {message ? <Notice tone="success">{message}</Notice> : null}{error ? <Notice>{error}</Notice> : null}
  </PageShell>;
}
