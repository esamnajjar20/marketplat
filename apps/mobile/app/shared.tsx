import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Spinner } from '@/components/ui';
import { router } from 'expo-router';
import { PageShell, Notice, SectionCard, PrimaryButton } from '@/components/MobileUI';
import { decodeSharedPayload, sharedPayloadFromUrl, type SharedPayload } from '@/features/sharing/shared-payload';
import { spacing, typography } from '@/theme/tokens';
type State = {
  status: 'loading';
} | {
  status: 'empty';
} | {
  status: 'invalid';
} | {
  status: 'ok';
  payload: SharedPayload;
};
export default function SharedScreen() {
  const { colors } = useAppTheme();
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const consume = (url: string | null | undefined) => {
      if (!active)
        return;
      const encoded = sharedPayloadFromUrl(url ?? null);
      if (!encoded) {
        setState({ status: 'empty' });
        return;
      }
      const payload = decodeSharedPayload(encoded);
      setState(payload ? {
        status: 'ok', payload
      } : { status: 'invalid' });
    };
    void Linking.getInitialURL().then(consume).catch(() => consume(null));
    const sub = Linking.addEventListener('url', event => consume(event.url));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return <PageShell title="محتوى تمت مشاركته">{state.status === 'loading' ? <Spinner color={colors.brand}/> : state.status === 'empty' ? <Notice>لا توجد بيانات مشاركة في هذا الرابط. امسح رمز المشاركة مرة أخرى أو افتح الرابط من المتصفح.</Notice> : state.status === 'invalid' ? <Notice>تعذر قراءة بيانات المشاركة. قد يكون الرمز تالفًا أو من إصدار أحدث.</Notice> : <><Notice tone="warning">غير موثّق — معاينة قابلة للتزوير وليست إعلانًا صادرًا عن الخادم. يمكن لأي شخص تغيير العنوان والسعر والتفاصيل؛ لا تعتمد أي معلومة هنا ولا تتواصل أو تدفع بناءً عليها. افتح السوق وابحث عن الإعلان الأصلي للتحقق منه.</Notice><SectionCard><Text tone="brand" strong>{({
    ad: 'إعلان', product: 'منتج', service: 'خدمة', store: 'متجر'
  })[state.payload.kind]}</Text><Text style={{
    ...typography.title, color: colors.ink, textAlign: 'right', marginTop: spacing.sm
  }}>{state.payload.title}</Text>{state.payload.price ? <Text style={{
    ...typography.subtitle, color: colors.warning, textAlign: 'right', marginTop: spacing.sm
  }}>سعر غير موثّق: {formatMoney(state.payload.price)}</Text> : null}<Text style={{
    color: colors.muted, textAlign: 'right', marginTop: spacing.sm
  }}>{[state.payload.city, state.payload.extra].filter(Boolean).join(' · ')}</Text>{state.payload.desc ? <Text style={{
    color: colors.ink, textAlign: 'right', lineHeight: 24, marginTop: spacing.md
  }}>{state.payload.desc}</Text> : null}</SectionCard><PrimaryButton label="فتح السوق للتحقق من الإعلان" onPress={() => router.replace('/explore')}/></>}</PageShell>;
}
