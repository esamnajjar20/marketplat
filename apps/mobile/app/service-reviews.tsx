import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { createServiceReview, fetchServiceReviews, type ServiceReview } from '@/features/services/service-management.api';
import { Field, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { PageList } from '@/components/ui/PageList';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { toPaginatedResponse } from '@/lib/pagination';
import { fontSizes, spacing } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
const reviewKey = (item: ServiceReview) => item.id;
const renderReview = ({ item }: { item: ServiceReview }) => <SectionCard><Text tone="ink" strong>{item.reviewer?.name || item.rater?.name || 'عميل'} · {'★'.repeat(item.score)}{'☆'.repeat(5 - item.score)}</Text><Text tone="muted">{item.comment || 'بدون تعليق'}</Text><Text tone="muted" size={11}>{formatSafeDate(item.createdAt, 'date')}</Text></SectionCard>;
export default function ServiceReviewsScreen() {
  const { colors } = useAppTheme();
  const p = useLocalSearchParams<{
    sellerProfileId?: string | string[];
    requestId?: string | string[];
  }>();
  const sellerProfileId = Array.isArray(p.sellerProfileId) ? p.sellerProfileId[0] : p.sellerProfileId;
  const initialRequestId = Array.isArray(p.requestId) ? p.requestId[0] : p.requestId;
  const { accessToken, csrfToken } = useAuth();
  const [requestId, setRequestId] = useState(initialRequestId || '');
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const list = usePaginatedList<ServiceReview>({
    key: `service-reviews:${sellerProfileId ?? ''}`,
    pageSize: 10,
    enabled: Boolean(sellerProfileId),
    fetchPage: async (page) => toPaginatedResponse(await fetchServiceReviews(sellerProfileId as string, page)),
    getItemKey: (item) => item.id,
    mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل التقييمات.'),
  });
  const { items, loading, loadingMore, hasNextPage, loadMoreError: moreError } = list;
  const error = formError || list.error || '';
  const submit = async () => {
    if (!accessToken)
      return router.push('/login');
    if (!requestId.trim()) {
      setFormError('أدخل رقم طلب الخدمة المكتمل الذي تريد تقييمه.');
      return;
    }
    setBusy(true);
    setFormError('');
    setMessage('');
    try {
      await createServiceReview({
        requestId: requestId.trim(), score, comment: comment.trim() || undefined
      }, accessToken, csrfToken);
      setRequestId('');
      setComment('');
      setMessage('تم إرسال التقييم.');
      await list.refresh();
    }
    catch (e) {
      setFormError(e instanceof Error ? e.message : 'تعذر إرسال التقييم. تأكد أن الطلب مكتمل وأنه يخصك.');
    }
    finally {
      setBusy(false);
    }
  };
  const header = !sellerProfileId ? <Notice>معرّف ملف البائع غير متوفر في الرابط.</Notice> : loading && items.length === 0 ? <Notice tone="muted">جارٍ تحميل التقييمات…</Notice> : error && items.length === 0 ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.refresh()}/></> : items.length === 0 ? <Notice tone="muted">لا توجد تقييمات منشورة بعد.</Notice> : null;
  const footer = <>{error && items.length > 0 ? <Notice>{error}</Notice> : null}{!loading && hasNextPage ? <><PrimaryButton label={loadingMore ? 'جارٍ التحميل…' : moreError ? 'إعادة المحاولة' : 'تحميل تقييمات إضافية'} variant="secondary" busy={loadingMore} onPress={() => void list.loadMore()}/>{moreError ? <Notice>{moreError}</Notice> : null}</> : null}{accessToken ? <SectionCard><Text tone="ink" strong size={17}>أضف تقييمًا بعد إتمام الخدمة</Text><Notice tone="muted">تمت تعبئة رقم الطلب المكتمل تلقائيًا من الشاشة السابقة.</Notice>{!initialRequestId ? <Field label="رقم طلب الخدمة" value={requestId} onChangeText={setRequestId} placeholder="معرّف الطلب المكتمل"/> : <Text tone="muted">رقم الطلب: {initialRequestId}</Text>}<View style={{
    flexDirection: 'row', justifyContent: 'center', gap: spacing.md
  }}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`التقييم ${n} من 5 نجوم`} accessibilityState={{ selected: score === n }} onPress={() => setScore(n)} style={{
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center'
  }}><Text style={{
    fontSize: fontSizes[30], color: n <= score ? colors.accent : colors.muted
  }}>★</Text></Pressable>)}</View><Field label="التعليق (اختياري)" value={comment} onChangeText={setComment} multiline maxLength={500} placeholder="شارك تجربتك"/><PrimaryButton label="إرسال التقييم" onPress={() => void submit()} busy={busy}/></SectionCard> : <PrimaryButton label="تسجيل الدخول لإضافة تقييم" onPress={() => router.push('/login')}/>}{error ? <Notice>{error}</Notice> : null}{message ? <Notice tone="success">{message}</Notice> : null}</>;
  return <PageList title="تقييمات مقدم الخدمة" data={items} keyExtractor={reviewKey} renderItem={renderReview} header={header} footer={footer}/>;
}
