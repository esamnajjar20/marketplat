import { AppText as Text } from '@/components/ui/AppText';
import { AppIcon } from '@/components/Icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { getConfiguredWebUrl } from '@/lib/web-links';
import { fetchMyProfile, updateNotificationPreferences } from '@/features/account/account.api';
import {
  ListRow,
  Notice,
  PageShell,
  PrimaryButton,
  SectionCard,
  SectionHeader,
} from '@/components/MobileUI';
import { fontSizes, colors, elevation, radius, spacing, typography, ux } from '@/theme/tokens';
import { AccountSecuritySection } from '@/components/ui/AccountSecuritySection';
import {
  isAndroidPushEnabled,
  requestAndRegisterAndroidPush,
  unregisterAndroidFcmToken,
} from '@/features/notifications/native-push';
import { showToast } from '@/lib/toast';

type PreferenceValue = boolean | string;
type Preferences = Record<string, PreferenceValue>;

const DEFAULT_PREFS: Preferences = {
  newMessage: true,
  adViews: false,
  favAdUpdated: true,
  promotions: false,
  myPromotions: true,
  savedSearch: true,
  storeUpdates: true,
  followUpdates: true,
  serviceQuotes: true,
  salesAlerts: true,
  lowStockAlerts: true,
  installmentAlerts: true,
  debtAlerts: true,
  weeklySalesReport: true,
  emailFallback: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  quietHoursAllowUrgent: true,
  quietHoursTimeZone: 'Asia/Gaza',
};

const preferenceGroups: { title: string; rows: [string, string][] }[] = [
  { title: 'التواصل', rows: [['newMessage', 'الرسائل الجديدة']] },
  {
    title: 'المفضلة والبحث',
    rows: [
      ['favAdUpdated', 'تحديثات الإعلانات المفضلة'],
      ['savedSearch', 'تنبيهات عمليات البحث المحفوظة'],
    ],
  },
  {
    title: 'المتاجر والعروض',
    rows: [
      ['storeUpdates', 'تحديثات المتاجر التي أتابعها'],
      ['followUpdates', 'تحديثات الحسابات التي أتابعها'],
      ['myPromotions', 'عروضي الترويجية'],
      ['promotions', 'عروض وتخفيضات المنصة'],
    ],
  },
  { title: 'الخدمات', rows: [['serviceQuotes', 'عروض وطلبات الخدمات']] },
  {
    title: 'المبيعات والمخزون',
    rows: [
      ['salesAlerts', 'تذكير المبيعات'],
      ['lowStockAlerts', 'تنبيهات انخفاض المخزون'],
      ['installmentAlerts', 'تنبيهات الأقساط المتأخرة'],
      ['debtAlerts', 'تنبيهات الديون'],
      ['weeklySalesReport', 'تقرير المبيعات الأسبوعي'],
      ['adViews', 'تقرير مشاهدات إعلاناتي'],
    ],
  },
];

function getDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function validTime(value: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value);
}

function openWeb(path: string) {
  void Linking.openURL(getConfiguredWebUrl(path)).catch(() =>
    showToast('تعذر فتح الرابط', 'افتح الموقع الرسمي من المتصفح.', 'error'),
  );
}

export default function SettingsScreen() {
  const { accessToken, getAccessToken, csrfToken, logout, isBusy, user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoadingPreferences(false);
      setPreferencesLoaded(false);
      return;
    }
    setLoadingPreferences(true);
    setPreferencesLoaded(false);
    setError('');
    setMessage('');
    try {
      const profile = await fetchMyProfile(token, user?.id);
      const saved = profile.notificationPreferences ?? {};
      const merged: Preferences = { ...DEFAULT_PREFS };
      for (const key of Object.keys(DEFAULT_PREFS)) {
        const value = saved[key];
        if (typeof DEFAULT_PREFS[key] === 'boolean' && typeof value === 'boolean') merged[key] = value;
        if (typeof DEFAULT_PREFS[key] === 'string' && typeof value === 'string') merged[key] = value;
      }
      setPrefs(merged);
      setPreferencesLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الإعدادات. أعد المحاولة قبل الحفظ.');
    } finally {
      setLoadingPreferences(false);
    }
  }, [getAccessToken, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void isAndroidPushEnabled().then((enabled) => {
      if (active) setPushEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const toggle = (key: string, value: boolean) => setPrefs((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!accessToken || !preferencesLoaded || loadingPreferences) return;
    if (!validTime(String(prefs.quietHoursStart)) || !validTime(String(prefs.quietHoursEnd))) {
      setError('أدخل وقتًا صحيحًا بصيغة 24 ساعة مثل 22:00.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const token = getAccessToken();
      if (!token) {
        router.push('/login');
        return;
      }
      const saved = await updateNotificationPreferences(prefs, token, csrfToken, user?.id);
      setPrefs((current) => ({ ...current, ...(saved.notificationPreferences ?? {}) }));
      setMessage('تم حفظ تفضيلات الإشعارات.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات.');
    } finally {
      setBusy(false);
    }
  };

  const enableDevicePush = async () => {
    const token = getAccessToken();
    if (!token) {
      router.push('/login');
      return;
    }
    setPushBusy(true);
    setError('');
    setMessage('');
    try {
      await requestAndRegisterAndroidPush(token, csrfToken);
      setPushEnabled(true);
      setMessage('تم تفعيل إشعارات الجهاز وربطه بحسابك.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تفعيل إشعارات الجهاز.');
    } finally {
      setPushBusy(false);
    }
  };

  const disableDevicePush = async () => {
    const token = getAccessToken();
    if (!token) {
      router.push('/login');
      return;
    }
    setPushBusy(true);
    setError('');
    setMessage('');
    try {
      await unregisterAndroidFcmToken(token, csrfToken);
      setPushEnabled(false);
      setMessage('تم إيقاف إشعارات الجهاز لهذا الحساب.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إيقاف إشعارات الجهاز.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      const result = await logout();
      if (result === 'done') router.replace('/');
    } catch {
      setError('تعذر إكمال تسجيل الخروج. لم يتم تأكيد العملية.');
    }
  };

  return (
    <PageShell title="الإعدادات">
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لإدارة إعدادات الحساب.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        </>
      ) : (
        <>
          {loadingPreferences ? (
            <SectionCard>
              <Text style={styles.loadingText}>جارٍ تحميل تفضيلات الإشعارات…</Text>
            </SectionCard>
          ) : null}

          {/* إشعارات الجهاز */}
          <View style={styles.section}>
            <SectionHeader
              title="إشعارات الجهاز"
              subtitle="تنبيهات فورية حتى عندما يكون التطبيق مغلقاً"
            />
            <SectionCard style={styles.cardPad}>
              <Text style={styles.bodyText}>
                فعّل إشعارات Android لتلقي تنبيهات MarketPlat. سيطلب التطبيق الإذن بعد ضغطك على الزر فقط.
              </Text>
              {Platform.OS === 'android' ? (
                pushEnabled ? (
                  <PrimaryButton
                    label="إيقاف إشعارات الجهاز"
                    variant="secondary"
                    busy={pushBusy}
                    onPress={() => void disableDevicePush()}
                  />
                ) : (
                  <PrimaryButton
                    label="تفعيل إشعارات الجهاز"
                    busy={pushBusy}
                    onPress={() => void enableDevicePush()}
                  />
                )
              ) : (
                <Notice tone="muted">إشعارات الجهاز الفورية متاحة حالياً على Android.</Notice>
              )}
            </SectionCard>
          </View>

          {/* تفضيلات الإشعارات */}
          <View style={styles.section}>
            <SectionHeader title="تفضيلات الإشعارات" subtitle="اختر ما تريد تلقيه" />
            {preferenceGroups.map((group) => (
              <View key={group.title} style={styles.prefGroup}>
                <Text style={styles.prefGroupTitle}>{group.title}</Text>
                <View style={styles.prefCard}>
                  {group.rows.map(([key, label], index) => (
                    <View key={key}>
                      <View style={styles.prefRow}>
                        <Switch
                          value={Boolean(prefs[key])}
                          onValueChange={(value) => toggle(key, value)}
                          trackColor={{ false: colors.border, true: colors.brandSoftActive ?? colors.brandSoft }}
                          thumbColor={Boolean(prefs[key]) ? colors.brand : colors.muted}
                          accessibilityLabel={label}
                        />
                        <Text style={styles.prefLabel}>{label}</Text>
                      </View>
                      {index < group.rows.length - 1 ? <View style={styles.divider} /> : null}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* ساعات الهدوء + بريد */}
          <View style={styles.section}>
            <SectionHeader title="ساعات الهدوء والبريد" />
            <View style={styles.prefCard}>
              <View style={styles.prefRow}>
                <Switch
                  value={Boolean(prefs.quietHoursEnabled)}
                  onValueChange={(value) => toggle('quietHoursEnabled', value)}
                  trackColor={{ false: colors.border, true: colors.brandSoftActive ?? colors.brandSoft }}
                  thumbColor={Boolean(prefs.quietHoursEnabled) ? colors.brand : colors.muted}
                  accessibilityLabel="تفعيل ساعات الهدوء"
                />
                <Text style={styles.prefLabel}>تفعيل ساعات الهدوء</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>من</Text>
                  <TextInput
                    allowFontScaling
                    maxFontSizeMultiplier={1.3}
                    accessibilityLabel="بداية ساعات الهدوء"
                    value={String(prefs.quietHoursStart)}
                    onChangeText={(value) => setPrefs((p) => ({ ...p, quietHoursStart: value }))}
                    placeholder="22:00"
                    placeholderTextColor={colors.muted}
                    style={styles.timeInput}
                    textAlign="center"
                  />
                </View>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>إلى</Text>
                  <TextInput
                    allowFontScaling
                    maxFontSizeMultiplier={1.3}
                    accessibilityLabel="نهاية ساعات الهدوء"
                    value={String(prefs.quietHoursEnd)}
                    onChangeText={(value) => setPrefs((p) => ({ ...p, quietHoursEnd: value }))}
                    placeholder="08:00"
                    placeholderTextColor={colors.muted}
                    style={styles.timeInput}
                    textAlign="center"
                  />
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.prefRow}>
                <Switch
                  value={Boolean(prefs.quietHoursAllowUrgent)}
                  onValueChange={(value) => toggle('quietHoursAllowUrgent', value)}
                  trackColor={{ false: colors.border, true: colors.brandSoftActive ?? colors.brandSoft }}
                  thumbColor={Boolean(prefs.quietHoursAllowUrgent) ? colors.brand : colors.muted}
                  accessibilityLabel="السماح بالتنبيهات العاجلة"
                />
                <Text style={styles.prefLabel}>السماح بالتنبيهات العاجلة أثناء الهدوء</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.prefRow}>
                <Switch
                  value={Boolean(prefs.emailFallback)}
                  onValueChange={(value) => toggle('emailFallback', value)}
                  trackColor={{ false: colors.border, true: colors.brandSoftActive ?? colors.brandSoft }}
                  thumbColor={Boolean(prefs.emailFallback) ? colors.brand : colors.muted}
                  accessibilityLabel="إشعارات البريد البديلة"
                />
                <Text style={styles.prefLabel}>إشعارات البريد كبديل عند الحاجة</Text>
              </View>
              {deviceTimeZone ? (
                <Text style={styles.tzHint}>المنطقة الزمنية للجهاز: {deviceTimeZone}</Text>
              ) : null}
            </View>
            <PrimaryButton
              label="حفظ تفضيلات الإشعارات"
              busy={busy}
              disabled={!preferencesLoaded || loadingPreferences}
              onPress={() => void save()}
            />
          </View>

          {/* روابط الحساب */}
          <View style={styles.section}>
            <SectionHeader title="الحساب والجهاز" />
            <View style={styles.prefCard}>
              <ListRow
                title="الجلسات النشطة"
                description="إدارة الأجهزة المتصلة بحسابك"
                glyph="◎"
                onPress={() => router.push('/sessions')}
              />
              <View style={styles.divider} />
              <ListRow
                title="المحفوظات بلا اتصال"
                description="العناصر المحفوظة للرجوع إليها دون إنترنت"
                glyph="◇"
                onPress={() => router.push('/saved-offline')}
              />
              <View style={styles.divider} />
              <ListRow
                title="إدارة متجري"
                description="معلومات المتجر والمنتجات"
                glyph="▦"
                onPress={() => router.push('/my-store')}
              />
              <View style={styles.divider} />
              <ListRow
                title="المستخدمون المحظورون"
                description="قائمة الحظر"
                glyph="⊘"
                onPress={() => router.push('/blocked-users')}
              />
              <View style={styles.divider} />
              <ListRow
                title="بلاغاتي"
                description="حالة البلاغات التي أرسلتها"
                glyph="⚑"
                onPress={() => router.push('/my-reports')}
              />
              <View style={styles.divider} />
              <ListRow
                title="التخزين والبيانات المحلية"
                description="المساحة والبيانات المشفرة"
                glyph="▣"
                onPress={() => router.push('/storage')}
              />
              <View style={styles.divider} />
              <ListRow
                title="العمليات بانتظار المزامنة"
                description="طلبات ورسائل تنتظر الاتصال"
                glyph="↻"
                onPress={() => router.push('/offline-queue')}
              />
            </View>
          </View>

          {/* مساعدة */}
          <View style={styles.section}>
            <SectionHeader title="المساعدة والمعلومات" />
            <View style={styles.prefCard}>
              <ListRow
                title="سياسة الخصوصية"
                glyph={<AppIcon name="privacy" size={20} color={colors.brand} />}
                onPress={() => openWeb('/privacy')}
              />
              <View style={styles.divider} />
              <ListRow
                title="الشروط والأحكام"
                glyph={<AppIcon name="file" size={20} color={colors.brand} />}
                onPress={() => openWeb('/terms')}
              />
              <View style={styles.divider} />
              <ListRow
                title="اتصل بنا"
                glyph={<AppIcon name="messages" size={20} color={colors.brand} />}
                onPress={() => openWeb('/contact')}
              />
              <View style={styles.divider} />
              <ListRow
                title="من نحن"
                glyph={<AppIcon name="info" size={20} color={colors.brand} />}
                onPress={() => openWeb('/about')}
              />
            </View>
          </View>

          <PrimaryButton
            label="تسجيل الخروج"
            variant="danger"
            busy={isBusy}
            onPress={() => void handleLogout()}
          />
          <AccountSecuritySection />
          <Notice tone="muted">الحساب الحالي: {user?.email ?? 'مستخدم مسجل'}</Notice>
        </>
      )}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  cardPad: {
    gap: spacing.md,
  },
  loadingText: {
    textAlign: 'center',
    color: colors.muted,
    ...typography.body,
  },
  bodyText: {
    textAlign: 'right',
    color: colors.muted,
    ...typography.body,
    lineHeight: 22,
  },
  prefGroup: {
    gap: spacing.sm,
  },
  prefGroupTitle: {
    ...typography.label,
    color: colors.muted,
    textAlign: 'right',
    paddingHorizontal: spacing.xs,
  },
  prefCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card ?? radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    ...elevation.sm,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  prefLabel: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  timeField: {
    flex: 1,
    gap: 4,
  },
  timeLabel: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'center',
  },
  timeInput: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.borderStrong ?? colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: fontSizes[15],
    paddingHorizontal: spacing.sm,
  },
  tzHint: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
