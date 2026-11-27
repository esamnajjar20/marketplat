import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack, pushOnce } from '@/lib/navigation';
import { useAuthSession } from '@/features/auth/AuthContext';
import { submitReport, type ReportReason } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { spacing, radius } from '@/theme/tokens';
import { Field } from '@/components/ui/Field';
import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';
const reasons: ReportReason[] = ['SCAM', 'FAKE', 'OFFENSIVE', 'SPAM'];
const targetLabels = DOMAIN_STATUS_LABELS.reportTarget;
export default function ReportTargetScreen() {
  const { colors } = useAppTheme();
  const p = useLocalSearchParams<{
    targetType?: string | string[];
    targetId?: string | string[];
  }>();
  const targetType = Array.isArray(p.targetType) ? p.targetType[0] : p.targetType;
  const targetId = Array.isArray(p.targetId) ? p.targetId[0] : p.targetId;
  const { accessToken, csrfToken } = useAuthSession();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const validTarget = Boolean(targetId && targetType && [
    'ads', 'users', 'stores', 'products', 'services'
  ].includes(targetType));
  const send = async () => {
    if (!accessToken) {
      pushOnce('/login');
      return;
    }
    if (!validTarget || !targetType || !targetId || busy) {
      setError('رابط البلاغ غير صالح.');
      return;
    }
    if (!reason) {
      setError('اختر سبب البلاغ قبل الإرسال.');
      return;
    }
    if (notes.trim().length > 500) {
      setError('التفاصيل يجب ألا تتجاوز 500 حرف.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitReport(targetType as 'ads' | 'users' | 'stores' | 'products' | 'services', targetId, reason, notes, accessToken, csrfToken);
      setSuccess(true);
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إرسال البلاغ.');
    }
    finally {
      setBusy(false);
    }
  };
  return <PageShell title="الإبلاغ عن محتوى">{!accessToken ? <><Notice>يلزم تسجيل الدخول لإرسال بلاغ.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')}/></> : !validTarget ? <Notice>الرابط لا يحتوي على نوع ومرجع صالحين للبلاغ.</Notice> : success ? <SectionCard><Text tone="ink" strong size={18}>تم إرسال البلاغ</Text><Text style={{
    textAlign: 'right', color: colors.muted, lineHeight: 22
  }}>شكرًا لمساعدتك في الحفاظ على سلامة المنصة. سيراجع الفريق البلاغ وفق إجراءات المنصة.</Text><PrimaryButton label="العودة" onPress={() => goBack()}/></SectionCard> : <><SectionCard><Text tone="ink" strong>الإبلاغ عن {targetLabels[targetType as keyof typeof targetLabels] || 'المحتوى'}</Text><Text style={{
    textAlign: 'right', color: colors.muted, lineHeight: 21
  }}>اختر السبب الأقرب للمشكلة. لا ترسل معلومات شخصية لا حاجة لها.</Text>{reasons.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: reason === value }} accessibilityLabel={DOMAIN_STATUS_LABELS.reportReason[value]} onPress={() => setReason(value)} style={{
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: reason === item.value ? colors.brand : colors.border, borderRadius: radius.button, backgroundColor: reason === item.value ? colors.surface : 'transparent'
  }}><Text style={{
    textAlign: 'right', color: colors.ink, fontWeight: reason === item.value ? '700' : '400'
  }}>{reason === value ? '● ' : '○ '}{DOMAIN_STATUS_LABELS.reportReason[value]}</Text></Pressable>)}<Field label="تفاصيل إضافية (اختياري)" value={notes} onChangeText={setNotes} multiline maxLength={500} showCharacterCount placeholder="اشرح المشكلة بإيجاز (500 حرف كحد أقصى)" inputStyle={{ minHeight: 124, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.lg, textAlign: 'right', color: colors.ink }} /><PrimaryButton label="إرسال البلاغ" onPress={() => void send()} busy={busy}/></SectionCard></>}{error ? <Notice>{error}</Notice> : null}</PageShell>;
}
