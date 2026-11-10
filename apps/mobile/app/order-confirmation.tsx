import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { PageShell, PrimaryButton, SectionCard, Notice } from '@/components/MobileUI';
import { fontSizes, spacing, typography } from '@/theme/tokens';

export default function OrderConfirmationScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ orderId?: string | string[]; status?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const queued = status === 'queued';
  const created = status === 'created' && typeof orderId === 'string' && orderId.trim().length > 0;
  const invalid = !queued && !created;

  return (
    <PageShell title={invalid ? 'حالة الطلب غير متاحة' : queued ? 'الطلب محفوظ' : 'تم إرسال الطلب'}>
      {invalid ? (
        <SectionCard>
          <Notice>لم نتمكن من التحقق من حالة الطلب من الرابط الحالي. لا يعني فتح هذه الشاشة أن الطلب أُرسل.</Notice>
          <PrimaryButton label="عرض طلباتي" onPress={() => router.replace('/orders')} />
          <PrimaryButton label="العودة إلى السوق" variant="secondary" onPress={() => router.replace('/')} />
        </SectionCard>
      ) : <SectionCard>
        <View style={styles.mark}><AppText style={styles.check}>{queued ? '◷' : '✓'}</AppText></View>
        <AppText style={styles.title}>{queued ? 'طلبك محفوظ على هذا الجهاز' : 'وصل طلبك إلى المتجر'}</AppText>
        <AppText style={styles.body}>
          {queued
            ? 'لم يتمكن التطبيق من تأكيد استلام الخادم للطلب. حُفظ الطلب محليًا وسيُعاد إرساله عند عودة الاتصال. لا تعتبره المتجر مستلمًا بعد.'
            : 'استلم المتجر طلبك. يمكنك متابعة حالته وتفاصيله من صفحة الطلب.'}
        </AppText>
        {queued ? <Notice tone="warning">قد يتغير السعر أو المخزون قبل المزامنة. راجع حالة العملية بعد عودة الاتصال.</Notice> : orderId ? <AppText style={styles.orderRef}>رقم الطلب: {orderId.slice(-8).toUpperCase()}</AppText> : null}
        {queued ? (
          <PrimaryButton label="عرض العمليات بانتظار المزامنة" onPress={() => router.replace('/offline-queue')} />
        ) : orderId ? (
          <PrimaryButton label="عرض تفاصيل الطلب" onPress={() => router.replace(`/orders/${encodeURIComponent(orderId)}`)} />
        ) : null}
        <PrimaryButton label={queued ? 'العودة إلى السوق' : 'عرض طلباتي'} variant="secondary" onPress={() => router.replace(queued ? '/' : '/orders')} />
      </SectionCard>}
    </PageShell>
  );
}

const createThemeStyles = (colors: ColorPalette) => ({
  mark: { width: 64, height: 64, borderRadius: 32, alignSelf: 'center' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.successSoft },
  check: { color: colors.success, fontSize: fontSizes[34], fontWeight: '800' as const },
  title: { color: colors.ink, ...typography.title, textAlign: 'center' as const },
  body: { color: colors.muted, ...typography.body, textAlign: 'center' as const, lineHeight: 24 },
  orderRef: { color: colors.brandOnSoft, ...typography.captionStrong, textAlign: 'center' as const, padding: spacing.sm, backgroundColor: colors.brandSoft, borderRadius: 10 },
});
