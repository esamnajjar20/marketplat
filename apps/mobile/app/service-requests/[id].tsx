import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney, formatDate } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppHeader, ErrorState, LoadingState } from '@/components/ui';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchServiceRequest, respondToServiceRequest, type ServiceRequest } from '@/features/services/services.api';
import { MediaGallery } from '@/components/ui/MediaGallery';
import { ServiceRequestTimeline } from '@/components/ui/ServiceRequestTimeline';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { domainLabel } from '@/lib/status-labels';
import { fontSizes, radius, spacing, typography, fontWeights } from '@/theme/tokens';
import { showToast } from '@/lib/toast';
import { useAsyncResource } from '@/hooks/useAsyncResource';
const money = (v?: string | number | null) => v == null || v === '' ? 'غير محدد' : Number.isFinite(Number(v)) ? formatMoney(Number(v)) : String(v);
const dateTime = (v?: string | null) => {
    if (!v)
        return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? formatDate(d) : null;
};
type Action = 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
export default function ServiceRequestDetailScreen() {
    const { colors } = useAppTheme();
    const s = useMemo(() => createThemeS(colors), [colors]);
    const params = useLocalSearchParams<{
        id?: string | string[];
    }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const { user, accessToken, csrfToken } = useAuth();
    const [busy, setBusy] = useState<Action | ''>('');
    const [quote, setQuote] = useState('');
    const [disputeReason, setDisputeReason] = useState('');
    // دورة الجلب الموحّدة؛ حقل السعر المقترح يُهيَّأ من الطلب المُحمَّل.
    const resource = useAsyncResource<ServiceRequest>(
        async () => {
            const data = await fetchServiceRequest(id as string, accessToken as string);
            setQuote(data.quotedPrice == null ? '' : String(data.quotedPrice));
            return data;
        },
        {
            key: `${id ?? ''}|${accessToken ? 1 : 0}`,
            manual: !id || !accessToken,
            tag: 'service-request-detail',
            mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل تفاصيل الطلب.'),
        },
    );
    const { data: request, loading, refreshing, reload } = resource;
    const error = !id ? 'معرّف طلب الخدمة غير صالح.' : !accessToken ? 'سجّل الدخول لعرض تفاصيل طلب الخدمة.' : resource.error ?? '';
    const load = useCallback((refresh = false) => reload({ soft: refresh }), [reload]);
    const role = useMemo(() => {
        const providerUserId = request?.listing?.provider?.sellerProfile?.userId ?? request?.provider?.sellerProfile?.userId;
        return {
            customer: !!user?.id && request?.customerId === user.id, provider: !!user?.id && providerUserId === user.id
        };
    }, [request, user?.id]);
    const needsQuote = request?.listing?.serviceType?.capabilities?.requestQuote === true;
    const status = request?.status || 'PENDING';
    const runAction = async (action: Action) => {
        if (!request || !accessToken || busy)
            return;
        const extra: {
            quotedPrice?: number;
            agreedPrice?: number;
            disputeReason?: string;
        } = {};
        if (action === 'ACCEPTED' && role.provider && needsQuote) {
            const value = Number(quote);
            if (!quote.trim() || !Number.isFinite(value) || value <= 0) {
                showToast('السعر المقترح مطلوب', 'أدخل سعرًا صحيحًا أكبر من صفر.', 'info');
                return;
            }
            extra.quotedPrice = Math.round(value * 100) / 100;
        }
        if (action === 'IN_PROGRESS' && role.customer && needsQuote) {
            const value = Number(request.quotedPrice);
            if (!Number.isFinite(value) || value <= 0) {
                showToast('لا يوجد سعر مقترح', 'اطلب من مقدم الخدمة تحديد السعر أولًا.', 'info');
                return;
            }
            extra.agreedPrice = value;
        }
        if (action === 'DISPUTED') {
            if (disputeReason.trim().length < 10) {
                showToast('سبب الاعتراض', 'اكتب 10 أحرف على الأقل.', 'info');
                return;
            }
            extra.disputeReason = disputeReason.trim();
        }
        setBusy(action);
        try {
            await respondToServiceRequest(request.id, action, accessToken, csrfToken, extra);
            setDisputeReason('');
            await load(true);
            showToast('تم تحديث الطلب', 'تم حفظ حالة طلب الخدمة.', 'success');
        }
        catch (e) {
            showToast('تعذر تحديث الطلب', e instanceof Error ? e.message : 'لم يؤكد الخادم تنفيذ الإجراء.', 'error');
        }
        finally {
            setBusy('');
        }
    };
    const actionButton = (label: string, action: Action, tone: 'primary' | 'secondary' | 'danger' = 'primary', confirmation?: string) => <Pressable key={action} accessibilityRole="button" disabled={!!busy} onPress={() => confirmAlert(label, confirmation || `هل تريد تنفيذ «${label}»؟`, [{
            text: 'إلغاء', style: 'cancel'
        }, {
            text: 'متابعة', style: tone === 'danger' ? 'destructive' : 'default', onPress: () => void runAction(action)
        }])} style={[
        s.action, tone === 'secondary' && s.secondary, tone === 'danger' && s.danger, busy && s.disabled
    ]}><Text style={[s.actionText, tone === 'secondary' && s.secondaryText, tone === 'danger' && s.dangerText]}>{busy === action ? 'جارٍ التحديث…' : label}</Text></Pressable>;
    return <ScreenFrame keyboardAvoiding>
    <AppHeader title="تفاصيل طلب الخدمة" right={<Pressable accessibilityRole="button" accessibilityLabel="تحديث" onPress={() => void load(true)} style={s.refresh}><Text style={s.refreshText}>{refreshing ? '…' : 'تحديث'}</Text></Pressable>}/>
    {loading ? <LoadingState message="جارٍ تحميل تفاصيل الطلب…"/> : error ? <ErrorState description={error} actionLabel={accessToken ? 'إعادة المحاولة' : 'تسجيل الدخول'} onAction={() => !accessToken ? pushOnce('/login') : void load()}/> : request ? <ScrollView contentContainerStyle={s.content}>
      <View style={s.card}>
        <View style={s.titleRow}><Text style={s.title}>{request.listing?.title || 'طلب خدمة'}</Text><Text style={s.status}>{domainLabel('serviceRequest', status, status)}</Text></View>
        <Text style={s.label}>تفاصيل الطلب كاملة</Text><Text style={s.body}>{request.details?.trim() || 'لم تُسجل تفاصيل إضافية لهذا الطلب.'}</Text>
        <View style={s.metaGroup}><Text style={s.meta}>تاريخ الإرسال: {dateTime(request.createdAt) || 'غير متوفر'}</Text><Text style={s.meta}>السعر في الخدمة: {money(request.listing?.price)}</Text>{request.quotedPrice != null ? <Text style={s.meta}>السعر المقترح: {money(request.quotedPrice)}</Text> : null}{request.agreedPrice != null ? <Text style={s.meta}>السعر المتفق عليه: {money(request.agreedPrice)}</Text> : null}{request.listing?.durationEstimate ? <Text style={s.meta}>المدة المتوقعة: {request.listing.durationEstimate}</Text> : null}</View>
        {request.listing?.description ? <><Text style={s.label}>وصف الخدمة</Text><Text style={s.body}>{request.listing.description}</Text></> : null}
        <Text style={s.meta}>العميل: {request.customer?.displayName || request.customer?.name || 'مستخدم'}</Text><Text style={s.meta}>مقدم الخدمة: {request.listing?.provider?.businessName || request.provider?.businessName || 'مقدم خدمة'}</Text>
      </View>
      {request.attachedImages?.length ? <View style={s.card}><Text style={s.sectionTitle}>صور مرفقة بالطلب</Text><MediaGallery images={request.attachedImages} title="صور طلب الخدمة"/></View> : null}
      {request.listing?.images?.length ? <View style={s.card}><Text style={s.sectionTitle}>صور الخدمة</Text><MediaGallery images={request.listing.images} title={request.listing.title || 'صور الخدمة'}/></View> : null}
      {request.appointment ? <View style={s.card}><Text style={s.sectionTitle}>الموعد</Text><Text style={s.meta}>من: {dateTime(request.appointment.scheduledStart) || 'غير محدد'}</Text><Text style={s.meta}>إلى: {dateTime(request.appointment.scheduledEnd) || 'غير محدد'}</Text><Text style={s.meta}>الحالة: {domainLabel('appointment', request.appointment.status, 'غير محدد')}</Text>{request.appointment.notes ? <Text style={s.body}>{request.appointment.notes}</Text> : null}</View> : null}
      <View style={s.card}><ServiceRequestTimeline status={status} createdAt={request.createdAt} respondedAt={request.respondedAt}/></View>
      {role.provider && status === 'PENDING' && needsQuote ? <View style={s.card}><Text style={s.sectionTitle}>السعر المقترح</Text><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="السعر المقترح بالشيكل" value={quote} onChangeText={(value) => setQuote(normalizeNumericInput(value))} keyboardType="decimal-pad" placeholder="أدخل السعر بالشيكل" placeholderTextColor={colors.muted} style={s.input}/></View> : null}
      {(role.customer || role.provider) && [
                'PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'
            ].includes(status) ? <View style={s.card}><Text style={s.sectionTitle}>إجراءات الطلب</Text><View style={s.actions}>
        {role.provider && status === 'PENDING' ? <>{actionButton('قبول الطلب', 'ACCEPTED', 'primary', needsQuote ? 'سيُرسل السعر المقترح للعميل للموافقة.' : 'هل تريد قبول طلب الخدمة؟')}{actionButton('رفض الطلب', 'REJECTED', 'danger', 'سيتم رفض الطلب ولن يمكن متابعة تنفيذه.')}</> : null}
        {role.customer && status === 'PENDING' ? actionButton('إلغاء الطلب', 'CANCELLED', 'danger') : null}
        {role.provider && status === 'ACCEPTED' && !needsQuote ? actionButton('بدء التنفيذ', 'IN_PROGRESS') : null}
        {role.customer && status === 'ACCEPTED' && needsQuote ? actionButton('الموافقة على السعر وبدء التنفيذ', 'IN_PROGRESS', 'primary', `هل توافق على السعر المقترح ${money(request.quotedPrice)}؟`) : null}
        {(role.customer || role.provider) && ['ACCEPTED', 'IN_PROGRESS'].includes(status) ? actionButton('إلغاء الطلب', 'CANCELLED', 'danger') : null}
        {role.provider && status === 'IN_PROGRESS' ? actionButton('تأكيد اكتمال الخدمة', 'COMPLETED') : null}
        {role.customer && ['IN_PROGRESS', 'COMPLETED'].includes(status) ? <View style={s.dispute}><Text style={s.label}>سبب الاعتراض (10 أحرف على الأقل)</Text><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="سبب الاعتراض على الخدمة" value={disputeReason} onChangeText={setDisputeReason} multiline maxLength={1000} placeholder="اشرح سبب الاعتراض…" placeholderTextColor={colors.muted} style={[s.input, s.multiline]} textAlign="right"/><View>{actionButton('فتح اعتراض', 'DISPUTED', 'danger', 'سيتم تحويل الطلب إلى حالة المراجعة.')}</View></View> : null}
        {role.customer && status === 'COMPLETED' && (request.listing?.provider?.sellerProfile?.id || request.provider?.sellerProfile?.id) ? <Pressable accessibilityRole="button" onPress={() => router.push({
                pathname: '/service-reviews', params: {
                    sellerProfileId: request.listing?.provider?.sellerProfile?.id || request.provider?.sellerProfile?.id || '', requestId: request.id
                }
            })} style={[s.action, s.secondary]}><Text style={s.secondaryText}>قيّم الخدمة</Text></Pressable> : null}
        {role.customer && ['ACCEPTED', 'IN_PROGRESS'].includes(status) ? <Pressable accessibilityRole="button" onPress={() => router.push({
                pathname: '/appointment-create', params: { requestId: request.id }
            })} style={[s.action, s.secondary]}><Text style={s.secondaryText}>{request.appointment ? 'إدارة الموعد' : 'حجز موعد'}</Text></Pressable> : null}
      </View></View> : null}
      {!role.customer && !role.provider ? <View style={s.card}><Text style={s.muted}>لا تظهر إجراءات تعديل هذا الطلب لهذا الحساب.</Text></View> : null}
      {request.disputeReason ? <View style={s.card}><Text style={s.sectionTitle}>سبب الاعتراض</Text><Text style={s.body}>{request.disputeReason}</Text></View> : null}
    </ScrollView> : null}
  </ScreenFrame>;
}
const createThemeS = (colors: ColorPalette) => StyleSheet.create({ refresh: {
        minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center'
    }, refreshText: {
        color: colors.brand, fontWeight: fontWeights.bold
    },
    content: {
        padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.x4l
    }, card: {
        padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surface
    },
    titleRow: {
        flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, flexWrap: 'wrap'
    }, title: {
        flex: 1, color: colors.ink, fontSize: fontSizes[18], lineHeight: 27, fontWeight: fontWeights.bold, textAlign: 'right'
    }, status: {
        color: colors.brandOnSoft, backgroundColor: colors.brandSoft, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSizes[12], fontWeight: fontWeights.bold
    },
    sectionTitle: {
        ...typography.subtitle, color: colors.ink, textAlign: 'right'
    }, label: {
        ...typography.captionStrong, color: colors.muted, textAlign: 'right'
    }, body: {
        ...typography.body, color: colors.ink, textAlign: 'right', lineHeight: 25
    }, metaGroup: {
        gap: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border
    }, meta: {
        ...typography.caption, color: colors.muted, textAlign: 'right'
    },
    actions: { gap: spacing.sm }, action: {
        minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.control, backgroundColor: colors.brand
    }, actionText: {
        color: colors.onBrand, fontWeight: fontWeights.bold, textAlign: 'center'
    }, secondary: {
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand
    }, secondaryText: {
        color: colors.brand, fontWeight: fontWeights.bold, textAlign: 'center'
    }, danger: {
        backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder
    }, dangerText: {
        color: colors.danger, fontWeight: fontWeights.bold, textAlign: 'center'
    }, disabled: { opacity: 0.55 }, input: {
        minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.control, paddingHorizontal: spacing.md, color: colors.ink, textAlign: 'right', backgroundColor: colors.canvas
    }, multiline: {
        minHeight: 92, padding: spacing.md, textAlignVertical: 'top', writingDirection: 'rtl'
    }, dispute: {
        gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md
    }, muted: {
        color: colors.muted, textAlign: 'right', lineHeight: 22
    },
});
