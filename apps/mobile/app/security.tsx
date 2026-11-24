import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccountSecuritySection } from '@/components/ui/AccountSecuritySection';
import { ChangePasswordForm } from '@/features/account/ChangePasswordForm';
import { PageShell } from '@/components/ui';
import { fontSizes, spacing } from '@/theme/tokens';
import { View } from 'react-native';

/** Security hub: password management and active-session controls. */
export default function SecurityScreen() {
  const { colors } = useAppTheme();
  return (
    <PageShell title="أمان الحساب">
      <View style={{ gap: spacing.md }}>
        <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[13], lineHeight: 22 }}>
          غيّر كلمة المرور وراجع الأجهزة التي تستخدم حسابك. عند تغيير كلمة المرور ستحتاج إلى تسجيل الدخول من جديد.
        </Text>
        <ChangePasswordForm />
        <AccountSecuritySection />
      </View>
    </PageShell>
  );
}
