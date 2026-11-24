import { AppText as Text } from '@/components/ui/AppText';
import { router } from 'expo-router';
import { View } from 'react-native';
import { PrimaryButton } from './Button';
import { SectionCard } from './Section';
import { spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
export function AccountSecuritySection() {
  const { colors } = useAppTheme();
  return <SectionCard><Text tone="ink" strong size={17}>أمان الحساب</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>راجع الجلسات النشطة، أو أنهِ جلسة محددة أو سجّل الخروج من جميع الأجهزة.</Text><View style={{ gap: spacing.sm }}><PrimaryButton label="الأجهزة والجلسات النشطة" variant="secondary" onPress={() => router.push('/sessions')} /><PrimaryButton label="حذف الحساب" variant="danger" onPress={() => router.push('/delete-account')} /></View></SectionCard>;
}
