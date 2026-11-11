import { useAppTheme } from '@/theme/ThemeProvider';
import { Spinner } from '@/components/ui';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmAlert } from '@/lib/confirm';
import { useLocalSearchParams, router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/features/auth/AuthContext';
import { acceptRequestOffer, cancelMarketplaceRequest, fetchMarketplaceRequest, submitRequestOffer, type MarketplaceRequest } from '@/features/requests/requests.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { enqueueRequestOffer } from '@/storage/outbox-manager';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { ApiError } from '@/api/client';
import { startConversationWithUser } from '@/features/messaging/messaging.api';
import { formatSafeDate } from '@/lib/date-format';
import { showToast } from '@/lib/toast';
export default function RequestDetailScreen() {
  const { colors } = useAppTheme();
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const { accessToken, getAccessToken, csrfToken, user } = useAuth();
  const offerOperationIdRef = useRef(createMobileOperationId('request-offer'));
  const [item, setItem] = useState<MarketplaceRequest | null>(null);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError('معرّف الطلب غير صالح.');
      return;
    }
    const current = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const fetched = await fetchMarketplaceRequest(id, getAccessToken());
      if (current === seq.current)
        setItem(fetched);
    }
    catch (e) {
      if (current === seq.current)
        setError(e instanceof Error ? e.message : 'تعذر تحميل الطلب.');
    }
    finally {
      if (current === seq.current)
        setLoading(false);
    }
  }, [id, getAccessToken]);
  useEffect(() => {
    void load();
    return () => {
      seq.current += 1;
    };
  }, [load]);
  const offer = async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    const p = Number(normalizeNumericInput(price));
    if (!Number.isFinite(p) || p <= 0) {
      setError('أدخل سعرًا صحيحًا أكبر من صفر.');
      return;
    }
    if (!user?.emailVerified) {
      setError('أكد بريدك الإلكتروني قبل تقديم عرض.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const network = await NetInfo.fetch();
      const online = network.isConnected === true && network.isInternetReachable !== false;
      if (!online) {
        if (!user?.id)
          throw new Error('سجّل الدخول بالحساب نفسه لحفظ العرض.');
        await enqueueRequestOffer(String(user.id), id, p, message.trim() || undefined, offerOperationIdRef.current);
        setPrice('');
        setMessage('');
        showToast('حُفظ العرض للمزامنة', 'لم يُرسل العرض إلى الخادم بعد. سيُعاد التحقق من صلاحية الطلب عند عودة الاتصال.', 'info', {
          label: 'عرض العمليات', onPress: () => router.push('/offline-queue')
        });
        return;
      }
      try {
        await submitRequestOffer(id, {
          price: p, message: message.trim() || undefined
        }, accessToken, csrfToken, offerOperationIdRef.current);
      }
      catch (onlineError) {
        if (onlineError instanceof ApiError && onlineError.status == null && user?.id) {
          await enqueueRequestOffer(String(user.id), id, p, message.trim() || undefined, offerOperationIdRef.current);
          setPrice('');
          setMessage('');
          showToast('حُفظ العرض للمزامنة', 'لم يؤكد الخادم استلام العرض. حُفظ بنفس مفتاح العملية لتجنب تكراره.', 'warning', {
            label: 'عرض العمليات', onPress: () => router.push('/offline-queue')
          });
          return;
        }
        if (onlineError instanceof ApiError && onlineError.status != null)
          offerOperationIdRef.current = createMobileOperationId('request-offer');
        throw onlineError;
      }
      offerOperationIdRef.current = createMobileOperationId('request-offer');
      setPrice('');
      setMessage('');
      await load();
      showToast('تم إرسال العرض', 'يمكنك متابعة عروضك من صفحة عروضي.', 'success');
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إرسال العرض.');
    }
    finally {
      setBusy(false);
    }
  };
  const cancel = () => confirmAlert('إلغاء الطلب', 'هل تريد إلغاء هذا الطلب؟', [{
      text: 'تراجع', style: 'cancel'
    }, {
      text: 'إلغاء الطلب', style: 'destructive', onPress: () => {
        if (!accessToken)
          return;
        setBusy(true);
        void cancelMarketplaceRequest(id, accessToken, csrfToken).then(load).catch(e => setError(e instanceof Error ? e.message : 'تعذر الإلغاء.')).finally(() => setBusy(false));
      }
    }]);
  const accept = (offerId: string) => confirmAlert('قبول العرض', 'سيُسجّل قبول هذا العرض على الطلب.', [{
      text: 'رجوع', style: 'cancel'
    }, {
      text: 'قبول العرض', onPress: () => {
        if (!accessToken)
          return;
        setBusy(true);
        void acceptRequestOffer(id, offerId, accessToken, csrfToken).then(load).catch(e => setError(e instanceof Error ? e.message : 'تعذر قبول العرض.')).finally(() => setBusy(false));
      }
    }]);
  const owner = !!user && item?.customerId === user.id;
  const acceptedByMe = !!user?.id && item?.acceptedOffer?.offerer?.id === user.id;
  const acceptedContactId = owner ? item?.acceptedOffer?.offerer?.id : acceptedByMe ? item?.customerId : undefined;
  const messageAcceptedParty = async () => {
    if (!accessToken || !acceptedContactId) {
      setError('تعذر تحديد الطرف المقبول للتواصل.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const conversation = await startConversationWithUser(acceptedContactId, accessToken, undefined, csrfToken);
      router.push({
        pathname: '/messages/[id]', params: { id: conversation.id }
      });
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر بدء المحادثة.');
    }
    finally {
      setBusy(false);
    }
  };
  return <PageShell title="تفاصيل الطلب">{loading ? <Spinner color={colors.brand}/> : !item ? <Notice>{error || 'لم يتم العثور على الطلب.'}</Notice> : <><SectionCard><Text tone="ink" strong size={20}>{item.title}</Text><Text tone="brand" strong size={12}>{item.type === 'SERVICE' ? 'طلب خدمة' : item.type === 'PRODUCT' ? 'طلب منتج' : 'طلب تأجير'} · {{
    OPEN: 'مفتوح', ACCEPTED: 'تم قبول عرض', CANCELLED: 'ملغى', COMPLETED: 'مكتمل', EXPIRED: 'منتهي'
  }[item.status || 'OPEN'] || 'قيد المعالجة'}</Text><Text style={{
    textAlign: 'right', lineHeight: 23, color: colors.ink
  }}>{item.description}</Text><Text tone="muted">المدينة: {item.city || 'غير محددة'}</Text><Text tone="ink" strong>الميزانية: {item.budgetMin == null ? '—' : formatMoney(item.budgetMin)} – {item.budgetMax == null ? '—' : formatMoney(item.budgetMax)}</Text><Text tone="muted" size={12}>تاريخ النشر: {formatSafeDate(item.createdAt, 'date', '—')}</Text></SectionCard>{owner ? <><Text tone="ink" strong size={17}>العروض الواردة</Text>{(item.offers || []).length === 0 ? <Notice tone="muted">لم تصل عروض بعد.</Notice> : (item.offers || []).map(o => <SectionCard key={o.id}><Text tone="ink" strong>{o.offerer?.sellerProfile?.displayName || o.offerer?.displayName || o.offerer?.name || 'مقدم العرض'}</Text><Text tone="brand" strong size={18}>{formatMoney(o.price)}</Text><Text tone="muted">{o.message || 'بدون رسالة'}</Text>{o.status === 'PENDING' && item.status === 'OPEN' ? <PrimaryButton label="قبول العرض" onPress={() => accept(o.id)} busy={busy}/> : <Text tone="muted">الحالة: {{
    PENDING: 'بانتظار الرد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', WITHDRAWN: 'مسحوب'
  }[o.status || ''] || 'محدّثة'}</Text>}</SectionCard>)}{item.status === 'ACCEPTED' && acceptedContactId ? <PrimaryButton label="مراسلة الطرف المقبول" variant="secondary" onPress={() => void messageAcceptedParty()} busy={busy}/> : null}{item.status === 'OPEN' ? <PrimaryButton label="إلغاء الطلب" variant="danger" onPress={cancel} busy={busy}/> : null}</> : item.status === 'ACCEPTED' && acceptedContactId ? <PrimaryButton label="مراسلة الطرف المقبول" variant="secondary" onPress={() => void messageAcceptedParty()} busy={busy}/> : item.status === 'OPEN' ? <SectionCard><Text tone="ink" strong size={17}>تقديم عرض</Text><Field label="السعر المقترح (شيكل)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00"/><Field label="رسالة لصاحب الطلب (اختياري)" value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder="وضح ما ستقدمه ومدة التنفيذ…"/><PrimaryButton label="إرسال العرض" onPress={() => void offer()} busy={busy}/></SectionCard> : <Notice tone="muted">لم يعد هذا الطلب يستقبل عروضًا جديدة.</Notice>}</>}{error ? <Notice>{error}</Notice> : null}</PageShell>;
}
