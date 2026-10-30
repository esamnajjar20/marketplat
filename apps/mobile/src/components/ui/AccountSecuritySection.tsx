import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
export function AccountSecuritySection() {
  return <SectionCard><Text style={{ textAlign: 'right', fontSize: 17, fontWeight: '900', color: colors.ink }}>أمان الحساب</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>راجع الأجهزة التي سجلت الدخول منها، أو أنهِ جلسة لم تعد تستخدمها.</Text><View style={{ gap: spacing.sm }}><PrimaryButton label="الأجهزة والجلسات النشطة" variant="secondary" onPress={() => router.push('/sessions')} /><PrimaryButton label="حذف الحساب" variant="danger" onPress={() => router.push('/delete-account')} /></View></SectionCard>;
}
