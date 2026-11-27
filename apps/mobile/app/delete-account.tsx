import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { AppText as Text } from '@/components/ui/AppText';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';
import { router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuthActions, useAuthSession, useAuthUser } from '@/features/auth/AuthContext';
import { deleteAccountAfterReauthentication } from '@/features/account/delete-account.api';
import { beginNativeGoogleDeletion } from '@/features/auth/google-oauth.native';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { Field } from '@/components/ui/Field';

export default function DeleteAccountScreen() {
  const { colors } = useAppTheme();

  const { user } = useAuthUser();
  const { accessToken, csrfToken } = useAuthSession();
  const { forceLocalSignOut } = useAuthActions();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const finishDeletion = async () => {
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
  };

  const submitGoogle = async () => {
    if (!accessToken) { router.replace('/login'); return; }
    if (confirmation.trim() !== 'حذف') { setError('اكتب كلمة «حذف» كما تظهر لتأكيد رغبتك.'); return; }
    setGoogleBusy(true);
    setError('');
    try {
      await beginNativeGoogleDeletion(accessToken, csrfToken);
      await finishDeletion();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف الحساب باستخدام Google.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = () => {
    if (!accessToken) { router.replace('/login'); return; }
    if (confirmation.trim() !== 'حذف') { setError('اكتب كلمة «حذف» كما تظهر لتأكيد رغبتك.'); return; }
    if (!password) { setError('أدخل كلمة المرور لإعادة توثيق الحساب قبل الحذف.'); return; }
    confirmAlert('تأكيد نهائي لحذف الحساب', 'سيتم تعطيل الحساب وإخفاء الإعلانات النشطة. لا يمكن التراجع عن هذا الإجراء من التطبيق.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف الحساب', style: 'destructive', onPress: () => {
        if (busy) return;
        setBusy(true); setError('');
        void deleteAccountAfterReauthentication(password, accessToken, csrfToken)
          .then(finishDeletion)
          .catch((e) => setError(e instanceof Error ? e.message : 'تعذر حذف الحساب.'))
          .finally(() => setBusy(false));
      } },
    ]);
  };
  return <PageShell title="حذف الحساب">
    <Notice tone="warning">الحذف يعطّل حسابك ويخفي الإعلانات النشطة وفق سياسة الخادم. اقرأ سياسة الخصوصية قبل المتابعة.</Notice>
    <SectionCard>
      <Text tone="ink" strong size={17}>إعادة توثيق الحساب</Text>
      <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>الحساب: {user?.email || 'مستخدم مسجل'}</Text>
      <Field label="كلمة المرور الحالية (للحسابات المحلية)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy && !googleBusy} placeholder="أدخل كلمة المرور الحالية" />
      <Field label="اكتب «حذف» للمتابعة" value={confirmation} onChangeText={setConfirmation} editable={!busy && !googleBusy} placeholder="حذف" />
      <View style={{ gap: spacing.sm }}>
        <PrimaryButton label="حذف الحساب بكلمة المرور" variant="danger" busy={busy} disabled={confirmation.trim() !== 'حذف' || !password || googleBusy} onPress={submit} />
        <PrimaryButton label="تأكيد Google وحذف الحساب" variant="secondary" busy={googleBusy} disabled={confirmation.trim() !== 'حذف' || busy} onPress={() => { void submitGoogle(); }} />
        <PrimaryButton label="إلغاء والعودة للإعدادات" variant="secondary" disabled={busy || googleBusy} onPress={() => pushOnce('/settings')} />
      </View>
      {error ? <Notice>{error}</Notice> : null}
    </SectionCard>
    <Notice tone="muted">يمكن تأكيد الحذف بكلمة المرور، أو بإعادة توثيق حساب Google المرتبط مسبقاً. يجب اختيار كلمة «حذف» قبل بدء أي من المسارين.</Notice>
  </PageShell>;
}
