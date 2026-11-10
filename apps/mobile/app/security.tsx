import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccountSecuritySection } from '@/components/ui/AccountSecuritySection';
import { PageShell } from '@/components/MobileUI';
import { fontSizes, spacing } from '@/theme/tokens';
import { View } from 'react-native';

/** Security tab separated from profile preferences to match the web settings hub. */
export default function SecurityScreen() {
  const { colors } = useAppTheme();
  return (
    <PageShell title="أمان الحساب">
      <View style={{ gap: spacing.md }}>
        <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[13], lineHeight: 22 }}>
          تحكم في حماية حسابك والأجهزة التي تستخدمه. يمكنك مراجعة الجلسات النشطة أو حذف الحساب.
        </Text>
        <AccountSecuritySection />
      </View>
    </PageShell>
  );
}
