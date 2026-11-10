import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { AppText as Text } from '@/components/ui/AppText';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteAccountAfterReauthentication } from '@/features/account/delete-account.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, radius, spacing, typography } from '@/theme/tokens';

export default function DeleteAccountScreen() {
  const { colors } = useAppTheme();

  const { user, accessToken, csrfToken, forceLocalSignOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = () => {
    if (!accessToken) { router.replace('/login'); return; }
    if (confirmation.trim() !== 'حذف') { setError('اكتب كلمة «حذف» كما تظهر لتأكيد رغبتك.'); return; }
    if (!password) { setError('أدخل كلمة المرور لإعادة توثيق الحساب قبل الحذف.'); return; }
    Alert.alert('تأكيد نهائي لحذف الحساب', 'سيتم تعطيل الحساب وإخفاء الإعلانات النشطة. لا يمكن التراجع عن هذا الإجراء من التطبيق.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف الحساب', style: 'destructive', onPress: () => {
        if (busy) return;
        setBusy(true); setError('');
        void deleteAccountAfterReauthentication(password, accessToken, csrfToken)
          .then(async () => {
            const localCleanup = await forceLocalSignOut({ clearPrivateData: true });
            if (!localCleanup.cleanupFailed && localCleanup.sessionRemoved) {
              showToast('تم تعطيل الحساب', 'تم تعطيل الحساب على الخادم وحذف بياناته المحلية من هذا الجهاز.', 'success');
            } else {
              const detail = [
                localCleanup.cleanupFailed
                  ? localCleanup.cleanupMarkerSaved
                    ? 'تعذر إكمال حذف البيانات المحلية، لكن حُفظ طلب التنظيف وسيُمنع الدخول حتى ينجح.'
                    : 'تعذر حذف البيانات المحلية وحفظ طلب التنظيف. لا تستخدم حسابًا آخر على هذا الجهاز قبل مسح بيانات التطبيق من إعدادات الجهاز.'
                  : '',
                !localCleanup.sessionRemoved ? 'لم يؤكد التخزين الآمن حذف جلسة الدخول المحفوظة. امسح بيانات التطبيق من إعدادات الجهاز قبل مشاركة الجهاز.' : '',
              ].filter(Boolean).join('\n\n');
              showToast('تم تعطيل الحساب', `عُطّل الحساب على الخادم. ${detail}`, 'warning');
            }
            router.replace('/');
          })
          .catch((e) => setError(e instanceof Error ? e.message : 'تعذر حذف الحساب.'))
          .finally(() => setBusy(false));
      } },
    ]);
  };
  return <PageShell title="حذف الحساب">
    <Notice tone="warning">الحذف يعطّل حسابك ويخفي الإعلانات النشطة وفق سياسة الخادم. اقرأ سياسة الخصوصية قبل المتابعة.</Notice>
    <SectionCard>
      <Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '900', fontSize: fontSizes[17] }}>إعادة توثيق الحساب</Text>
      <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>الحساب: {user?.email || 'مستخدم مسجل'}</Text>
      <Text style={{ textAlign: 'right', color: colors.ink, ...typography.label }}>كلمة المرور الحالية</Text>
      <TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="كلمة المرور الحالية لإعادة التوثيق" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="أدخل كلمة المرور الحالية" placeholderTextColor={colors.muted} style={{ minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: spacing.md, color: colors.ink, textAlign: 'right' }} />
      <Text style={{ textAlign: 'right', color: colors.ink, ...typography.label }}>اكتب «حذف» للمتابعة</Text>
      <TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="تأكيد حذف الحساب بكتابة حذف" value={confirmation} onChangeText={setConfirmation} editable={!busy} placeholder="حذف" placeholderTextColor={colors.muted} style={{ minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: spacing.md, color: colors.ink, textAlign: 'right' }} />
      <View style={{ gap: spacing.sm }}><PrimaryButton label="حذف الحساب نهائيًا" variant="danger" busy={busy} disabled={confirmation.trim() !== 'حذف' || !password} onPress={submit} /><PrimaryButton label="إلغاء والعودة للإعدادات" variant="secondary" disabled={busy} onPress={() => router.push('/settings')} /></View>
      {error ? <Notice>{error}</Notice> : null}
    </SectionCard>
    <Notice tone="muted">الحسابات التي أُنشئت عبر Google فقط، ولا تملك كلمة مرور محلية، تحتاج إلى إعادة توثيق Google. هذا التدفق غير مدعوم هنا حاليًا؛ لن يسمح هذا النموذج بتجاوز إعادة التوثيق.</Notice>
  </PageShell>;
}
