import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { AppText as Text } from '@/components/ui/AppText';
import { Notice, PrimaryButton, SecondaryButton, SectionCard } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { formatDate } from '@/lib/formatters';
import { confirmAlert } from '@/lib/confirm';
import { showToast } from '@/lib/toast';
import { spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getRegisteredAndroidFcmToken } from '@/features/notifications/native-push';
import { fetchNotificationDevices, removeNotificationDevice, type NotificationDevice } from './notification-devices.api';

const EMPTY: NotificationDevice[] = [];

function deviceName(device: NotificationDevice): string {
  if (device.label?.trim()) return device.label;
  if (device.kind === 'native') return device.platform === 'ios' ? 'تطبيق iOS' : device.platform === 'android' ? 'تطبيق Android' : 'تطبيق الجوال';
  return 'متصفح';
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatDate(date) : 'غير متوفر';
}

/** Lists server-owned push registrations without ever exposing their raw credentials. */
export function NotificationDevicesSection({ pushEnabled }: { pushEnabled: boolean }) {
  const { accessToken, csrfToken } = useAuth();
  const { colors } = useAppTheme();
  const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);
  const [currentNativeUnknown, setCurrentNativeUnknown] = useState(false);
  const [fingerprintReady, setFingerprintReady] = useState(false);
  const [busyId, setBusyId] = useState('');
  const resource = useAsyncResource<NotificationDevice[]>(
    () => fetchNotificationDevices(accessToken as string),
    {
      key: accessToken ? 'authenticated' : 'anonymous',
      manual: !accessToken,
      tag: 'notification-devices',
      mapError: (cause) => cause instanceof Error ? cause.message : 'تعذر تحميل أجهزة الإشعارات.',
    },
  );

  useEffect(() => {
    let active = true;
    setFingerprintReady(false);
    setCurrentNativeUnknown(false);
    void getRegisteredAndroidFcmToken()
      .then(async (token) => {
        if (!token) return { fingerprint: null, unknown: pushEnabled };
        const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token, { encoding: Crypto.CryptoEncoding.HEX });
        return { fingerprint: digest.slice(0, 16), unknown: false };
      })
      .then(({ fingerprint, unknown }) => {
        if (!active) return;
        setCurrentFingerprint(fingerprint);
        setCurrentNativeUnknown(unknown);
        setFingerprintReady(true);
      })
      .catch(() => {
        if (!active) return;
        setCurrentFingerprint(null);
        setCurrentNativeUnknown(true);
        setFingerprintReady(true);
      });
    return () => { active = false; };
  }, [accessToken, pushEnabled]);

  const remove = (device: NotificationDevice) => {
    if (!accessToken || busyId) return;
    const isCurrent = currentFingerprint !== null && device.fingerprint === currentFingerprint;
    if (isCurrent) {
      showToast('هذا الجهاز', 'لإيقاف الإشعارات على الجهاز الحالي استخدم زر إيقاف إشعارات الجهاز أعلاه.', 'info');
      return;
    }
    confirmAlert(
      'إيقاف إشعارات الجهاز',
      `سيتم إلغاء تسجيل «${deviceName(device)}» ومنعه من استقبال إشعارات الدفع لهذا الحساب. لن يتم تسجيل الخروج من الجهاز نفسه.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'إيقاف الجهاز', style: 'destructive', onPress: () => {
          setBusyId(device.id);
          void removeNotificationDevice(device.kind, device.id, accessToken, csrfToken)
            .then(() => {
              resource.setData((items) => items?.filter((item) => item.id !== device.id) ?? items);
              showToast('تم إيقاف الجهاز', 'لن يستقبل هذا الجهاز إشعارات الدفع من حسابك.', 'success');
            })
            .catch((cause) => showToast('تعذر إيقاف الجهاز', cause instanceof Error ? cause.message : 'حاول مرة أخرى.', 'error'))
            .finally(() => setBusyId(''));
        } },
      ],
    );
  };

  const devices = resource.data ?? EMPTY;
  return (
    <SectionCard>
      <View style={{ gap: spacing.sm }}>
        <View style={{ gap: spacing.xxs }}>
          <Text tone="ink" strong>الأجهزة المسجّلة للإشعارات</Text>
          <Text tone="muted" size={12}>يمكنك مراجعة المتصفحات والتطبيقات المرتبطة بإشعارات هذا الحساب وإيقاف جهاز لم تعد تستخدمه. لا تظهر رموز الإشعارات السرية في هذه القائمة.</Text>
        </View>
        {resource.loading ? <Notice tone="muted">جارٍ تحميل الأجهزة المسجّلة…</Notice> : null}
        {resource.error ? <><Notice>{resource.error}</Notice><SecondaryButton label="إعادة المحاولة" onPress={() => void resource.reload()} /></> : null}
        {!resource.loading && !resource.error && devices.length === 0 ? <Notice tone="muted">لا توجد أجهزة إشعارات مسجّلة.</Notice> : null}
        {!resource.error ? devices.map((device) => {
          const isCurrent = fingerprintReady && currentFingerprint !== null && device.fingerprint === currentFingerprint;
          const mayBeCurrent = currentNativeUnknown && device.kind === 'native' && device.platform === 'android';
          return (
            <View key={`${device.kind}:${device.id}`} style={{ gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm }}>
              <Text tone="ink" strong>{deviceName(device)}{isCurrent ? ' · هذا الجهاز' : ''}</Text>
              <Text tone="muted" size={12}>النوع: {device.kind === 'native' ? `تطبيق ${device.platform || 'جوال'}` : 'متصفح'}</Text>
              <Text tone="muted" size={12}>آخر نشاط: {dateLabel(device.lastSeenAt)}</Text>
              {isCurrent ? <Notice tone="muted">لإيقاف هذا الجهاز استخدم زر إيقاف إشعارات الجهاز الحالي.</Notice> : mayBeCurrent ? <Notice tone="muted">تعذر التحقق من بصمة جهاز Android الحالي؛ أوقف إشعارات هذا الجهاز من الزر أعلاه بدل إزالته من القائمة.</Notice> : <PrimaryButton label={busyId === device.id ? 'جارٍ الإيقاف…' : 'إيقاف إشعارات هذا الجهاز'} variant="danger" busy={busyId === device.id} disabled={!!busyId || !fingerprintReady} onPress={() => remove(device)} />}
            </View>
          );
        }) : null}
      </View>
    </SectionCard>
  );
}
