
import { AppText as Text } from '@/components/ui/AppText';
import { AppIcon } from '@/components/Icons';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';

import { fetchMyProfile, updateNotificationPreferences } from '@/features/account/account.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { createSettingsStyles } from '@/features/settings/settings.styles';
import { ThemeSection } from '@/features/settings/ThemeSection';
import { NotificationPreferencesSection } from '@/features/settings/NotificationPreferencesSection';
import { AccountLinksSection } from '@/features/settings/AccountLinksSection';
import { HelpSection } from '@/features/settings/HelpSection';
import { DEFAULT_PREFS, getDeviceTimeZone, validTime, type Preferences } from '@/features/settings/preferences';
import { spacing } from '@/theme/tokens';
import { isAndroidPushEnabled, requestAndRegisterAndroidPush, unregisterAndroidFcmToken } from '@/features/notifications/native-push';

import { useAppTheme } from '@/theme/ThemeProvider';

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);

  const { accessToken, getAccessToken, csrfToken, logout, isBusy, user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
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
      setError(e instanceof Error ? e.message : 'تعذر تحميل الإعدادات. حاول مرة أخرى قبل الحفظ.');
    } finally {
      setLoadingPreferences(false);
    }
  }, [getAccessToken, user?.id]);

  useEffect(() => {
    if (showNotificationSettings) void load();
  }, [load, showNotificationSettings]);

  useEffect(() => {
    if (!showNotificationSettings) return undefined;
    let active = true;
    void isAndroidPushEnabled().then((enabled) => {
      if (active) setPushEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, [showNotificationSettings, user?.id]);

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
        pushOnce('/login');
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
      pushOnce('/login');
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
      pushOnce('/login');
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
      <ThemeSection />
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لإدارة إعدادات الحساب.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </>
      ) : (
        <>
          <SectionCard style={styles.cardPad}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showNotificationSettings }}
              onPress={() => setShowNotificationSettings((value) => !value)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: spacing.md }}
            >
              <AppIcon name={showNotificationSettings ? 'back' : 'forward'} size={18} color={colors.brand} />
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text tone="ink" strong>إدارة تفضيلات الإشعارات</Text>
                <Text tone="muted" size={12}>إعدادات اختيارية؛ افتحها عند الحاجة فقط</Text>
              </View>
              <AppIcon name="notification" size={20} color={colors.brand} />
            </Pressable>
          </SectionCard>
          {showNotificationSettings ? <>
          <NotificationPreferencesSection
            prefs={prefs}
            setPrefs={setPrefs}
            toggle={toggle}
            loadingPreferences={loadingPreferences}
            preferencesLoaded={preferencesLoaded}
            busy={busy}
            pushEnabled={pushEnabled}
            pushBusy={pushBusy}
            deviceTimeZone={deviceTimeZone}
            enableDevicePush={enableDevicePush}
            disableDevicePush={disableDevicePush}
            save={save}
          />
          </> : null}

          <AccountLinksSection />

          <HelpSection />

          <PrimaryButton
            label="تسجيل الخروج"
            variant="danger"
            busy={isBusy}
            onPress={() => void handleLogout()}
          />
          <Notice tone="muted">الحساب الحالي: {user?.email ?? 'مستخدم مسجل'}</Notice>
        </>
      )}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </PageShell>
  );
}
