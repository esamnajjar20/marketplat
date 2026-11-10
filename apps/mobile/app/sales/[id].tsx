import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSaleDetail, fetchSaleReceipt } from '@/features/sales/sales-extra.api';
import type { SaleRecord } from '@/features/sales/sales.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { formatDate, formatMoney } from '@/lib/formatters';
const paymentMethodLabel = (method: string) => ({
    CASH: 'نقدًا', CASH_ON_DELIVERY: 'نقدًا عند الاستلام', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', WALLET: 'محفظة إلكترونية', OTHER: 'أخرى'
} as Record<string, string>)[method] || 'وسيلة دفع أخرى';
const installmentStatusLabel = (status: string) => ({
    PENDING: 'بانتظار الدفع', PAID: 'مدفوع', PARTIAL: 'مدفوع جزئيًا', OVERDUE: 'متأخر', CANCELLED: 'ملغى'
} as Record<string, string>)[status] || 'حالة محدثة';
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
    const [sale, setSale] = useState<SaleDetail | null>(null);
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        const token = getAccessToken();
        if (!token || !id) {
            setLoading(false);
            setError(!id ? 'معرّف البيع غير صالح.' : 'انتهت صلاحية الجلسة؛ سجّل الدخول مجددًا.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [sR, rR] = await Promise.allSettled([fetchSaleDetail(id, token, user?.id), fetchSaleReceipt(id, token, user?.id)]);
            if (sR.status === 'rejected')
                throw sR.reason;
            setSale(sR.value as SaleDetail);
            if (rR.status === 'fulfilled')
                setReceiptNumber(rR.value.invoiceNumber || rR.value.sale.invoiceNumber || null);
            else
                setReceiptNumber(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر تحميل تفاصيل البيع.');
        }
        finally {
            setLoading(false);
        }
    }, [getAccessToken, id, user?.id]);
    useEffect(() => {
        if (!isRestoring)
            void load();
    }, [isRestoring, load]);
    if (isRestoring)
        return <PageShell title="تفاصيل البيع"><Spinner color={colors.brand}/></PageShell>;
    if (!user)
        return <PageShell title="تفاصيل البيع"><Notice>سجّل الدخول لعرض تفاصيل البيع.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')}/></PageShell>;
    return <PageShell title="تفاصيل البيع">{loading ? <Spinner color={colors.brand}/> : error ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} variant="secondary"/></> : sale ? <><SectionCard><Text tone="ink" strong size={20}>{sale.entityTitle}</Text><Text tone="muted" size={13}>فاتورة: {receiptNumber || 'غير مرقمة'}</Text><Text tone="muted">تاريخ البيع: {formatDate(sale.soldAt)}</Text><Text tone="muted">نوع البيع: {{
        PRODUCT: 'منتج', AD: 'إعلان', SERVICE: 'خدمة', FREE: 'عنصر مجاني'
    }[sale.entityType] || 'غير محدد'}</Text><Text tone="muted">حالة الدفع: {{
        PAID: 'مدفوع بالكامل', PARTIAL: 'مدفوع جزئيًا', UNPAID: 'غير مدفوع', OVERDUE: 'متأخر'
    }[sale.paymentStatus] || 'غير محددة'}</Text><Text tone="muted">العميل: {sale.buyerName}{sale.buyerPhone ? ` · ${sale.buyerPhone}` : ''}</Text>{sale.store ? <Text tone="muted">المتجر: {sale.store.name}</Text> : null}{sale.note ? <Text tone="muted">ملاحظات: {sale.note}</Text> : null}</SectionCard><SectionCard><Text tone="ink" strong size={17}>ملخص المبالغ</Text>{[
        ['الإجمالي', formatMoney(sale.totalPrice, sale.currency)], ['المحصّل', formatMoney(sale.paidAmount, sale.currency)], ['المتبقي', formatMoney(sale.dueAmount, sale.currency)], ['المسترد', formatMoney(sale.refundedAmount, sale.currency)], ['الاستحقاق', sale.dueDate ? formatDate(sale.dueDate, 'date') : 'غير محدد']
    ].map(([label, value]) => <View key={String(label)} style={{
        flexDirection: 'row', justifyContent: 'space-between', gap: 8
    }}><Text style={{ color: colors.muted }}>{label}</Text><Text style={{
        color: label === 'المتبقي' && Number(sale.dueAmount) > 0 ? colors.danger : colors.ink, fontWeight: '700'
    }}>{value}</Text></View>)}</SectionCard>{sale.items?.length ? <SectionCard><Text tone="ink" strong size={16}>عناصر البيع</Text>{sale.items.map(item => <View key={item.id} style={{
        paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4
    }}><Text tone="ink" strong>{item.title}</Text><Text tone="muted">الكمية: {item.quantity} · سعر الوحدة: {formatMoney(item.unitPrice, sale.currency)}</Text><Text tone="brand" strong>الإجمالي: {formatMoney(item.lineTotal, sale.currency)}{item.returnedQuantity ? ` · مرتجع ${item.returnedQuantity}` : ''}</Text></View>)}</SectionCard> : null}{sale.payments?.length ? <SectionCard><Text tone="ink" strong size={16}>الدفعات المسجلة</Text>{sale.payments.map(payment => <View key={payment.id} style={{
        paddingVertical: 7, gap: 3
    }}><Text tone="ink" strong>{formatMoney(payment.amount, sale.currency)}</Text><Text tone="muted">{formatDate(payment.paidAt)}{payment.method ? ` · ${paymentMethodLabel(payment.method)}` : ''}{payment.note ? ` · ${payment.note}` : ''}</Text></View>)}</SectionCard> : null}{sale.installments?.length ? <SectionCard><Text tone="ink" strong size={16}>جدول الأقساط</Text>{sale.installments.map(inst => <View key={inst.id} style={{
        paddingVertical: 7, gap: 3
    }}><Text tone="ink" strong>القسط {inst.installmentNo} · {formatMoney(inst.amount, sale.currency)}</Text><Text tone="muted">مدفوع {formatMoney(inst.paidAmount, sale.currency)} · الاستحقاق {formatDate(inst.dueDate, 'date')} · {{
        PENDING: 'بانتظار الدفع', PAID: 'مدفوع', PARTIAL: 'مدفوع جزئيًا', OVERDUE: 'متأخر', CANCELLED: 'ملغى'
    }[inst.status] || 'حالة محدثة'}</Text></View>)}</SectionCard> : null}<PrimaryButton label="مشاركة ملخص البيع" variant="secondary" onPress={() => void Share.share({ message: `سوق غزة — ملخص بيع\nالفاتورة: ${receiptNumber || 'غير مرقمة'}\nالعنصر: ${sale.entityTitle}\nالنوع: ${{
            PRODUCT: 'منتج', AD: 'إعلان', SERVICE: 'خدمة', FREE: 'عنصر مجاني'
        }[sale.entityType] || 'غير محدد'}\nالإجمالي: ${formatMoney(sale.totalPrice, sale.currency)}\nالمدفوع: ${formatMoney(sale.paidAmount, sale.currency)}\nالمتبقي: ${formatMoney(sale.dueAmount, sale.currency)}\nالتاريخ: ${formatDate(sale.soldAt)}` })}/><PrimaryButton label="عرض الفاتورة" variant="secondary" onPress={() => router.push({
        pathname: '/sales/[id]/receipt', params: { id }
    })}/><PrimaryButton label="تسجيل دفعة قسط" onPress={() => router.push('/installments')}/><PrimaryButton label="العودة إلى مبيعاتي" variant="secondary" onPress={() => router.push('/my-sales')}/></> : null}</PageShell>;
}
