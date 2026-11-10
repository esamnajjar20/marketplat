import { AppText as Text } from '@/components/ui/AppText';
import { router } from 'expo-router';
import { View } from 'react-native';
import { PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
export function AccountSecuritySection() {
  const { colors } = useAppTheme();
  return <SectionCard><Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '900', color: colors.ink }}>أمان الحساب</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>راجع الأجهزة التي سجلت الدخول منها، أو أنهِ جلسة لم تعد تستخدمها.</Text><View style={{ gap: spacing.sm }}><PrimaryButton label="الأجهزة والجلسات النشطة" variant="secondary" onPress={() => router.push('/sessions')} /><PrimaryButton label="حذف الحساب" variant="danger" onPress={() => router.push('/delete-account')} /></View></SectionCard>;
}
