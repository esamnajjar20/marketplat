import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { View } from 'react-native';
import { Spinner, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSaleDetail, fetchSaleReceipt } from '@/features/sales/sales-extra.api';
import type { SaleRecord } from '@/features/sales/sales.api';
import { formatDate, formatMoney } from '@/lib/formatters';
import { fontWeights, spacing } from '@/theme/tokens';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { domainLabel } from '@/lib/status-labels';
import { shareText } from '@/features/sharing/deep-links';
type SaleDetail = SaleRecord & {
    note?: string | null;
    dueDate?: string | null;
    items?: Array<{
        id: string;
        title: string;
        quantity: number;
        unitPrice: number | string;
        lineTotal: number | string;
        returnedQuantity?: number;
    }>;
    payments?: Array<{
        id: string;
        amount: number | string;
        method?: string;
        note?: string | null;
        paidAt: string;
    }>;
    returns?: Array<{
        id: string;
        amount: number | string;
        quantity?: number;
        reason?: string | null;
        createdAt: string;
    }>;
    installments?: Array<{
        id: string;
        installmentNo: number;
        amount: number | string;
        paidAmount: number | string;
        dueDate: string;
        status: string;
    }>;
};
export default function SaleDetailScreen() {
    const { colors } = useAppTheme();
    const p = useLocalSearchParams<{
        id: string | string[];
    }>();
    const id = Array.isArray(p.id) ? p.id[0] : p.id;
    const { getAccessToken, user, isRestoring } = useAuth();
    const resource = useAsyncResource<{ sale: SaleDetail; receiptNumber: string | null }>(
        async () => {
            const token = getAccessToken();
            if (!id)
                throw new Error('معرّف البيع غير صالح.');
            if (!token)
                throw new Error('انتهت صلاحية الجلسة؛ سجّل الدخول مجددًا.');
            const [sR, rR] = await Promise.allSettled([fetchSaleDetail(id, token, user?.id), fetchSaleReceipt(id, token, user?.id)]);
            if (sR.status === 'rejected')
                throw sR.reason;
            return {
                sale: sR.value as SaleDetail,
                receiptNumber: rR.status === 'fulfilled' ? (rR.value.invoiceNumber || rR.value.sale.invoiceNumber || null) : null,
            };
        },
        {
            key: `${id ?? ''}|${user?.id ?? ''}`,
            manual: isRestoring,
            tag: 'sale-detail',
            mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل تفاصيل البيع.'),
        },
    );
    const { reload: load } = resource;
    const sale = resource.data?.sale ?? null;
    const receiptNumber = resource.data?.receiptNumber ?? null;
    const error = resource.error ?? '';
    // manual يتحول إلى false بعد الاستعادة؛ اللحظة قبل أول جلب تُعدّ تحميلًا لا فراغًا.
    const loading = !isRestoring && (resource.loading || (!resource.data && !resource.error));
    if (isRestoring)
        return <PageShell title="تفاصيل البيع"><Spinner color={colors.brand}/></PageShell>;
    if (!user)
        return <PageShell title="تفاصيل البيع"><Notice>سجّل الدخول لعرض تفاصيل البيع.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')}/></PageShell>;
    return <PageShell title="تفاصيل البيع">{loading ? <Spinner color={colors.brand}/> : error ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} variant="secondary"/></> : sale ? <><SectionCard><Text tone="ink" strong size={20}>{sale.entityTitle}</Text><Text tone="muted" size={13}>فاتورة: {receiptNumber || 'غير مرقمة'}</Text><Text tone="muted">تاريخ البيع: {formatDate(sale.soldAt)}</Text><Text tone="muted">نوع البيع: {domainLabel('saleEntity', sale.entityType, 'غير محدد')}</Text><Text tone="muted">حالة الدفع: {domainLabel('salePayment', sale.paymentStatus, 'غير محددة')}</Text><Text tone="muted">العميل: {sale.buyerName}{sale.buyerPhone ? ` · ${sale.buyerPhone}` : ''}</Text>{sale.store ? <Text tone="muted">المتجر: {sale.store.name}</Text> : null}{sale.note ? <Text tone="muted">ملاحظات: {sale.note}</Text> : null}</SectionCard><SectionCard><Text tone="ink" strong size={17}>ملخص المبالغ</Text>{[
        ['الإجمالي', formatMoney(sale.totalPrice, sale.currency)], ['المحصّل', formatMoney(sale.paidAmount, sale.currency)], ['المتبقي', formatMoney(sale.dueAmount, sale.currency)], ['المسترد', formatMoney(sale.refundedAmount, sale.currency)], ['الاستحقاق', sale.dueDate ? formatDate(sale.dueDate, 'date') : 'غير محدد']
    ].map(([label, value]) => <View key={String(label)} style={{
        flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm
    }}><Text style={{ color: colors.muted }}>{label}</Text><Text style={{
        color: label === 'المتبقي' && Number(sale.dueAmount) > 0 ? colors.danger : colors.ink, fontWeight: fontWeights.bold
    }}>{value}</Text></View>)}</SectionCard>{sale.items?.length ? <SectionCard><Text tone="ink" strong size={16}>عناصر البيع</Text>{sale.items.map(item => <View key={item.id} style={{
        paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.xs
    }}><Text tone="ink" strong>{item.title}</Text><Text tone="muted">الكمية: {item.quantity} · سعر الوحدة: {formatMoney(item.unitPrice, sale.currency)}</Text><Text tone="brand" strong>الإجمالي: {formatMoney(item.lineTotal, sale.currency)}{item.returnedQuantity ? ` · مرتجع ${item.returnedQuantity}` : ''}</Text></View>)}</SectionCard> : null}{sale.payments?.length ? <SectionCard><Text tone="ink" strong size={16}>الدفعات المسجلة</Text>{sale.payments.map(payment => <View key={payment.id} style={{
        paddingVertical: spacing.sm, gap: spacing.xs
    }}><Text tone="ink" strong>{formatMoney(payment.amount, sale.currency)}</Text><Text tone="muted">{formatDate(payment.paidAt)}{payment.method ? ` · ${domainLabel('paymentMethod', payment.method, 'وسيلة دفع أخرى')}` : ''}{payment.note ? ` · ${payment.note}` : ''}</Text></View>)}</SectionCard> : null}{sale.installments?.length ? <SectionCard><Text tone="ink" strong size={16}>جدول الأقساط</Text>{sale.installments.map(inst => <View key={inst.id} style={{
        paddingVertical: spacing.sm, gap: spacing.xs
    }}><Text tone="ink" strong>القسط {inst.installmentNo} · {formatMoney(inst.amount, sale.currency)}</Text><Text tone="muted">مدفوع {formatMoney(inst.paidAmount, sale.currency)} · الاستحقاق {formatDate(inst.dueDate, 'date')} · {domainLabel('installment', inst.status, 'حالة محدثة')}</Text></View>)}</SectionCard> : null}<PrimaryButton label="مشاركة ملخص البيع" variant="secondary" onPress={() => void shareText(`سوق غزة — ملخص بيع\nالفاتورة: ${receiptNumber || 'غير مرقمة'}\nالعنصر: ${sale.entityTitle}\nالنوع: ${domainLabel('saleEntity', sale.entityType, 'غير محدد')}\nالإجمالي: ${formatMoney(sale.totalPrice, sale.currency)}\nالمدفوع: ${formatMoney(sale.paidAmount, sale.currency)}\nالمتبقي: ${formatMoney(sale.dueAmount, sale.currency)}\nالتاريخ: ${formatDate(sale.soldAt)}`)}/><PrimaryButton label="عرض الفاتورة" variant="secondary" onPress={() => router.push({
        pathname: '/sales/[id]/receipt', params: { id }
    })}/><PrimaryButton label="تسجيل دفعة قسط" onPress={() => router.push('/installments')}/><PrimaryButton label="العودة إلى مبيعاتي" variant="secondary" onPress={() => router.push('/my-sales')}/></> : null}</PageShell>;
}
