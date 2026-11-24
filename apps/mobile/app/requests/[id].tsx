import { useAppTheme } from '@/theme/ThemeProvider';
import { Spinner, Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmAlert } from '@/lib/confirm';
import { useLocalSearchParams, router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/features/auth/AuthContext';
import { acceptRequestOffer, cancelMarketplaceRequest, fetchMarketplaceRequest, submitRequestOffer, withdrawRequestOffer, type MarketplaceRequest } from '@/features/requests/requests.api';
import { enqueueRequestOffer } from '@/storage/outbox-manager';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { ApiError } from '@/api/client';
import { startConversationWithUser } from '@/features/messaging/messaging.api';
import { formatSafeDate } from '@/lib/date-format';
import { domainLabel } from '@/lib/status-labels';
import { showToast } from '@/lib/toast';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { MediaGallery } from '@/components/ui/MediaGallery';
export default function RequestDetailScreen() {
  const { colors } = useAppTheme();
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const { accessToken, getAccessToken, csrfToken, user } = useAuth();
  const offerOperationIdRef = useRef(createMobileOperationId('request-offer'));
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const resource = useAsyncResource<MarketplaceRequest>(
    async () => {
      setNotFound(false);
      try {
        return await fetchMarketplaceRequest(id as string, getAccessToken());
      } catch (requestError) {
        setNotFound(requestError instanceof ApiError && requestError.status === 404);
        throw requestError;
      }
    },
    {
      key: id ?? '',
      manual: !id,
      tag: 'request-detail',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الطلب.'),
    },
  );
  const { data: resourceItem, loading, reload } = resource;
  // Do not briefly display a previous request while the route key changes.
  const item = resourceItem?.id === id ? resourceItem : null;
  const error = actionError || (!id ? 'معرّف الطلب غير صالح.' : resource.error ?? '');
  const load = useCallback(() => {
    setActionError('');
    return reload();
  }, [reload]);
  const offer = async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    const p = Number(normalizeNumericInput(price));
    if (!Number.isFinite(p) || p <= 0) {
      setActionError('أدخل سعرًا صحيحًا أكبر من صفر.');
      return;
    }
    if (!user?.emailVerified) {
      setActionError('أكد بريدك الإلكتروني قبل تقديم عرض.');
      return;
    }
    setBusy(true);
    setActionError('');
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
      setActionError(e instanceof Error ? e.message : 'تعذر إرسال العرض.');
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
        void cancelMarketplaceRequest(id, accessToken, csrfToken).then(load).catch(e => setActionError(e instanceof Error ? e.message : 'تعذر الإلغاء.')).finally(() => setBusy(false));
      }
    }]);
  const accept = (offerId: string) => confirmAlert('قبول العرض', 'سيُسجّل قبول هذا العرض على الطلب.', [{
      text: 'رجوع', style: 'cancel'
    }, {
      text: 'قبول العرض', onPress: () => {
        if (!accessToken)
          return;
        setBusy(true);
        void acceptRequestOffer(id, offerId, accessToken, csrfToken).then(load).catch(e => setActionError(e instanceof Error ? e.message : 'تعذر قبول العرض.')).finally(() => setBusy(false));
      }
    }]);
  const withdrawMyOffer = () => {
    if (!myOffer || !accessToken || myOffer.status !== 'PENDING') return;
    confirmAlert('سحب العرض', 'هل تريد سحب عرضك من هذا الطلب؟', [{
      text: 'إبقاء العرض', style: 'cancel'
    }, {
      text: 'سحب العرض', style: 'destructive', onPress: () => {
        setBusy(true);
        setActionError('');
        void withdrawRequestOffer(id, myOffer.id, accessToken, csrfToken)
          .then(load)
          .catch((e) => setActionError(e instanceof Error ? e.message : 'تعذر سحب العرض.'))
          .finally(() => setBusy(false));
      }
    }]);
  };
  const owner = !!user && item?.customerId === user.id;
  const myOffer = !owner && user?.id ? item?.offers?.find((candidate) => candidate.offerer?.id === user.id) : undefined;
  useEffect(() => {
    if (myOffer && (myOffer.status === 'PENDING' || myOffer.status === 'WITHDRAWN')) {
      setPrice(String(myOffer.price ?? ''));
      setMessage(myOffer.message ?? '');
    } else {
      setPrice('');
      setMessage('');
    }
  }, [myOffer]);
  const acceptedByMe = !!user?.id && item?.acceptedOffer?.offerer?.id === user.id;
  const acceptedContactId = owner ? item?.acceptedOffer?.offerer?.id : acceptedByMe ? item?.customerId : undefined;
  const messageAcceptedParty = async () => {
    if (!accessToken || !acceptedContactId) {
      setActionError('تعذر تحديد الطرف المقبول للتواصل.');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const conversation = await startConversationWithUser(acceptedContactId, accessToken, undefined, csrfToken);
      router.push({
        pathname: '/messages/[id]', params: { id: conversation.id }
      });
    }
    catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر بدء المحادثة.');
    }
    finally {
      setBusy(false);
    }
  };
  const offerCount = item?._count?.offers ?? item?.offers?.length ?? 0;
  const expiresAtMs = item?.expiresAt ? new Date(item.expiresAt).getTime() : Number.NaN;
  const hoursUntilExpiry = (expiresAtMs - Date.now()) / (60 * 60 * 1000);
  const expiringSoon = Number.isFinite(hoursUntilExpiry) && hoursUntilExpiry >= 0 && hoursUntilExpiry <= 48;
  const offerCountLabel = offerCount === 0 ? 'لا توجد عروض' : offerCount === 1 ? 'عرض واحد' : offerCount === 2 ? 'عرضان' : offerCount <= 10 ? `${offerCount} عروض` : `${offerCount} عرضًا`;
  const offerEditable = myOffer?.status === 'PENDING' || myOffer?.status === 'WITHDRAWN';
  return <PageShell title="تفاصيل الطلب">
    {loading ? <Spinner color={colors.brand}/> : !item ? <>
      <Notice>{notFound ? 'لم يتم العثور على هذا الطلب.' : error || 'تعذر تحميل تفاصيل الطلب.'}</Notice>
      {!notFound && resource.error ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void load()}/> : null}
    </> : <>
      <SectionCard>
        <Text tone="ink" strong size={20}>{item.title}</Text>
        <Text tone="brand" strong size={12}>{item.type === 'SERVICE' ? 'طلب خدمة' : item.type === 'PRODUCT' ? 'طلب منتج' : 'طلب تأجير'} · {domainLabel('request', item.status || 'OPEN', 'قيد المعالجة')}</Text>
        <Text style={{ textAlign: 'right', lineHeight: 23, color: colors.ink }}>{item.description}</Text>
        {item.attachedImages?.length ? <MediaGallery images={item.attachedImages} title={`صور طلب ${item.title}`}/> : null}
        <Text tone="muted">المدينة: {item.city || 'غير محددة'}</Text>
        <Text tone="ink" strong>الميزانية: {item.budgetMin == null ? '—' : formatMoney(item.budgetMin)} – {item.budgetMax == null ? '—' : formatMoney(item.budgetMax)}</Text>
        <Text tone="muted" size={12}>تاريخ النشر: {formatSafeDate(item.createdAt, 'date', '—')}</Text>
        {item.expiresAt ? <>
          <Text tone={expiringSoon ? 'danger' : 'muted'} size={12}>ينتهي: {formatSafeDate(item.expiresAt, 'date', '—')}{expiringSoon ? ' · ينتهي قريبًا' : ''}</Text>
        </> : null}
        <Text tone="muted" size={12}>{offerCountLabel}</Text>
      </SectionCard>
      {owner ? <>
        <Text tone="ink" strong size={17}>العروض الواردة</Text>
        {(item.offers || []).length === 0 ? <Notice tone="muted">لم تصل عروض بعد.</Notice> : (item.offers || []).map(o => <SectionCard key={o.id}>
          <Text tone="ink" strong>{o.offerer?.sellerProfile?.displayName || o.offerer?.displayName || o.offerer?.name || 'مقدم العرض'}</Text>
          <Text tone="brand" strong size={18}>{formatMoney(o.price)}</Text>
          <Text tone="muted">{o.message || 'بدون رسالة'}</Text>
          {o.status === 'PENDING' && item.status === 'OPEN' ? <PrimaryButton label="قبول العرض" onPress={() => accept(o.id)} busy={busy}/> : <Text tone="muted">الحالة: {domainLabel('offer', o.status, 'محدّثة')}</Text>}
        </SectionCard>)}
        {item.status === 'ACCEPTED' && acceptedContactId ? <PrimaryButton label="مراسلة الطرف المقبول" variant="secondary" onPress={() => void messageAcceptedParty()} busy={busy}/> : null}
        {item.status === 'OPEN' ? <PrimaryButton label="إلغاء الطلب" variant="danger" onPress={cancel} busy={busy}/> : null}
      </> : item.status === 'ACCEPTED' && acceptedContactId ? <PrimaryButton label="مراسلة الطرف المقبول" variant="secondary" onPress={() => void messageAcceptedParty()} busy={busy}/> : item.status === 'OPEN' ? <SectionCard>
        <Text tone="ink" strong size={17}>{myOffer ? 'عرضك على هذا الطلب' : 'تقديم عرض'}</Text>
        {myOffer ? <Text tone="muted" size={12}>حالة عرضك: {domainLabel('offer', myOffer.status, myOffer.status === 'WITHDRAWN' ? 'مسحوب' : 'محدّثة')}</Text> : null}
        {offerEditable ? <>
          <Field label="السعر المقترح (شيكل)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00"/>
          <Field label="رسالة لصاحب الطلب (اختياري)" value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder="وضح ما ستقدمه ومدة التنفيذ…"/>
          <PrimaryButton label={myOffer?.status === 'WITHDRAWN' ? 'إعادة تفعيل العرض' : myOffer ? 'تحديث العرض' : 'إرسال العرض'} onPress={() => void offer()} busy={busy}/>
          {myOffer?.status === 'PENDING' ? <PrimaryButton label="سحب عرضك" variant="danger" onPress={withdrawMyOffer} busy={busy}/> : null}
        </> : <>
          {myOffer ? <>
            <Text tone="brand" strong>{formatMoney(myOffer.price)}</Text>
            <Text tone="muted">{myOffer.message || 'بدون رسالة'}</Text>
            <Notice tone="muted">لا يمكن تعديل هذا العرض في حالته الحالية.</Notice>
          </> : <>
            <Field label="السعر المقترح (شيكل)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00"/>
            <Field label="رسالة لصاحب الطلب (اختياري)" value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder="وضح ما ستقدمه ومدة التنفيذ…"/>
            <PrimaryButton label="إرسال العرض" onPress={() => void offer()} busy={busy}/>
          </>}
        </>}
      </SectionCard> : <Notice tone="muted">لم يعد هذا الطلب يستقبل عروضًا جديدة.</Notice>}
    </>}
    {item && error ? <Notice>{error}</Notice> : null}
  </PageShell>;
}
