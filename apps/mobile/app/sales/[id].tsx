import { useAppTheme } from '@/theme/ThemeProvider';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppText as Text } from '@/components/ui/AppText';
import { View } from 'react-native';
import { useRef, useState } from 'react';
import { Spinner, Notice, PageShell, PrimaryButton, SectionCard, Field } from '@/components/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuthActions, useAuthSession, useAuthStatus, useAuthUser } from '@/features/auth/AuthContext';
import { addSalePayment, addSaleReturn, fetchSaleDetail, fetchSaleReceipt, type SaleReturnReason, type SaleTransferMethod } from '@/features/sales/sales-extra.api';
import type { SaleRecord } from '@/features/sales/sales.api';
import { formatDate, formatMoney } from '@/lib/formatters';
import { fontWeights, spacing } from '@/theme/tokens';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { domainLabel } from '@/lib/status-labels';
import { shareText } from '@/features/sharing/deep-links';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
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
        itemId: string | null;
        refundAmount: number | string;
        quantity: number;
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
    const { user } = useAuthUser();
    const { csrfToken } = useAuthSession();
    const { isRestoring } = useAuthStatus();
    const { getAccessToken } = useAuthActions();
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
    const [actionMode, setActionMode] = useState<'payment' | 'return' | null>(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const [actionMessage, setActionMessage] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<SaleTransferMethod>('CASH');
    const [paymentTransferRef, setPaymentTransferRef] = useState('');
    const [returnItemId, setReturnItemId] = useState('');
    const [returnQuantity, setReturnQuantity] = useState('1');
    const [returnRefund, setReturnRefund] = useState('');
    const [returnReason, setReturnReason] = useState<SaleReturnReason>('DAMAGED');
    const [returnNote, setReturnNote] = useState('');
    const [restockedToInventory, setRestockedToInventory] = useState(true);
    const paymentOperationRef = useRef<Record<string, string>>({});
    const returnOperationRef = useRef<Record<string, string>>({});
    const paymentMethods: Array<{ value: SaleTransferMethod; label: string }> = [
        { value: 'CASH', label: 'نقدي' }, { value: 'JAWWAL_PAY', label: 'جوال باي' },
        { value: 'BANK_PALESTINE', label: 'بنك فلسطين' }, { value: 'PALPAY', label: 'PalPay' },
        { value: 'CARD', label: 'بطاقة' }, { value: 'OTHER', label: 'أخرى' },
    ];
    const returnReasons: Array<{ value: SaleReturnReason; label: string }> = [
        { value: 'DAMAGED', label: 'معطوب' }, { value: 'WRONG_ITEM', label: 'صنف خاطئ' },
        { value: 'NOT_LIKED', label: 'لم يعجبه' }, { value: 'LATE', label: 'متأخر' }, { value: 'OTHER', label: 'أخرى' },
    ];
    const availableReturnItems = (sale?.items ?? []).filter(item => item.quantity - Number(item.returnedQuantity ?? 0) > 0);
    const selectedReturnItem = availableReturnItems.find(item => item.id === returnItemId) ?? availableReturnItems[0];
    const maxReturnQuantity = selectedReturnItem
        ? Math.max(0, selectedReturnItem.quantity - Number(selectedReturnItem.returnedQuantity ?? 0))
        : Math.max(0, (sale?.quantity ?? 0) - (sale?.returns ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0));
    const requestedReturnQuantity = Number(normalizeNumericInput(returnQuantity));
    const selectedItemPriorRefunds = selectedReturnItem
        ? (sale?.returns ?? []).filter(row => row.itemId === selectedReturnItem.id)
            .reduce((sum, row) => sum + Number(row.refundAmount ?? 0), 0)
        : 0;
    const maxReturnRefund = selectedReturnItem && Number.isInteger(requestedReturnQuantity) && requestedReturnQuantity > 0
        ? Math.max(0, Math.round((Number(selectedReturnItem.lineTotal) * (Number(selectedReturnItem.returnedQuantity ?? 0) + Math.min(requestedReturnQuantity, maxReturnQuantity)) / selectedReturnItem.quantity - selectedItemPriorRefunds) * 100) / 100)
        : 0;
    const submitPayment = async () => {
        const token = getAccessToken();
        const amount = Number(normalizeNumericInput(paymentAmount));
        if (!token || !sale) return;
        if (!Number.isFinite(amount) || amount <= 0 || amount > Number(sale.dueAmount)) {
            setActionError(`أدخل مبلغًا أكبر من صفر ولا يتجاوز ${formatMoney(sale.dueAmount, sale.currency)}.`);
            return;
        }
        const payload = { amount, method: paymentMethod, ...(paymentTransferRef.trim() ? { transferRef: paymentTransferRef.trim() } : {}) };
        const fingerprint = JSON.stringify(payload);
        const operationId = paymentOperationRef.current[fingerprint] ?? createMobileOperationId(`sale-payment-${sale.id}`);
        paymentOperationRef.current[fingerprint] = operationId;
        setActionBusy(true); setActionError(''); setActionMessage('');
        try {
            await addSalePayment(sale.id, { ...payload, offlineOperationId: operationId }, token, csrfToken, user?.id);
            delete paymentOperationRef.current[fingerprint];
            setPaymentAmount(''); setPaymentTransferRef(''); setActionMode(null);
            setActionMessage('تم تسجيل الدفعة وتحديث رصيد البيع.');
            await load();
        } catch (cause) {
            setActionError(cause instanceof Error ? cause.message : 'تعذر تسجيل الدفعة.');
        } finally { setActionBusy(false); }
    };
    const submitReturn = async () => {
        const token = getAccessToken();
        if (!token || !sale) return;
        const quantity = Number(normalizeNumericInput(returnQuantity));
        const refundAmount = Number(normalizeNumericInput(returnRefund));
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxReturnQuantity) {
            setActionError(`الكمية المتاحة للمرتجع: ${maxReturnQuantity}.`); return;
        }
        if (!Number.isFinite(refundAmount) || refundAmount < 0) {
            setActionError('أدخل مبلغ استرداد صالحًا.'); return;
        }
        if (refundAmount > maxReturnRefund) {
            setActionError(`الحد الأقصى للاسترداد لهذه الكمية هو ${formatMoney(maxReturnRefund, sale.currency)}.`);
            return;
        }
        if (availableReturnItems.length > 1 && !returnItemId) {
            setActionError('اختر الصنف المراد إرجاعه.'); return;
        }
        const payload = {
            ...(selectedReturnItem?.id ? { itemId: selectedReturnItem.id } : {}),
            quantity, refundAmount, reason: returnReason,
            ...(returnNote.trim() ? { reasonNote: returnNote.trim() } : {}),
            restockedToInventory,
        };
        const fingerprint = JSON.stringify(payload);
        const operationId = returnOperationRef.current[fingerprint] ?? createMobileOperationId(`sale-return-${sale.id}`);
        returnOperationRef.current[fingerprint] = operationId;
        setActionBusy(true); setActionError(''); setActionMessage('');
        try {
            await addSaleReturn(sale.id, { ...payload, offlineOperationId: operationId }, token, csrfToken, user?.id);
            delete returnOperationRef.current[fingerprint];
            setReturnQuantity('1'); setReturnRefund(''); setReturnNote(''); setActionMode(null);
            setActionMessage('تم تسجيل المرتجع وتحديث المخزون ورصيد البيع.');
            await load();
        } catch (cause) {
            setActionError(cause instanceof Error ? cause.message : 'تعذر تسجيل المرتجع.');
        } finally { setActionBusy(false); }
    };
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
    }}>{value}</Text></View>)}</SectionCard><SectionCard><Text tone="ink" strong size={16}>إجراءات البيع</Text><View style={{ flexDirection: 'row', gap: spacing.sm }}><View style={{ flex: 1 }}><PrimaryButton label="تسجيل دفعة" disabled={Number(sale.dueAmount) <= 0} onPress={() => { setActionMode(actionMode === 'payment' ? null : 'payment'); setActionError(''); setActionMessage(''); }} /></View><View style={{ flex: 1 }}><PrimaryButton label="تسجيل مرتجع" variant="secondary" disabled={maxReturnQuantity <= 0} onPress={() => { setActionMode(actionMode === 'return' ? null : 'return'); setReturnItemId(availableReturnItems[0]?.id ?? ''); setReturnQuantity('1'); setReturnRefund(availableReturnItems[0] ? String(Math.round(Number(availableReturnItems[0].lineTotal) / availableReturnItems[0].quantity * 100) / 100) : String(Number(sale.unitPrice))); setActionError(''); setActionMessage(''); }} /></View></View>{actionMessage ? <Notice tone="success">{actionMessage}</Notice> : null}{actionError ? <Notice>{actionError}</Notice> : null}{actionMode === 'payment' ? <View style={{ gap: spacing.sm }}><Text tone="muted">المتبقي: {formatMoney(sale.dueAmount, sale.currency)}</Text><Field label="مبلغ الدفعة" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="0.00"/><Text tone="muted" strong>وسيلة الدفع</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{paymentMethods.map(method => <Pressable key={method.value} accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === method.value }} onPress={() => setPaymentMethod(method.value)} style={{ borderWidth: 1, borderColor: paymentMethod === method.value ? colors.brand : colors.border, backgroundColor: paymentMethod === method.value ? colors.brandSoft : colors.surface, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}><Text tone={paymentMethod === method.value ? 'brand' : 'ink'}>{method.label}</Text></Pressable>)}</View>{paymentMethod !== 'CASH' && paymentMethod !== 'OTHER' ? <Field label="مرجع التحويل (اختياري)" value={paymentTransferRef} onChangeText={setPaymentTransferRef} maxLength={160} placeholder="رقم العملية أو المرجع"/> : null}<PrimaryButton label="تأكيد تسجيل الدفعة" busy={actionBusy} disabled={actionBusy} onPress={() => void submitPayment()}/><PrimaryButton label="إلغاء" variant="secondary" disabled={actionBusy} onPress={() => setActionMode(null)}/></View> : null}{actionMode === 'return' ? <View style={{ gap: spacing.sm }}>{availableReturnItems.length > 1 ? <><Text tone="muted" strong>الصنف المراد إرجاعه</Text><View style={{ gap: spacing.xs }}>{availableReturnItems.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: returnItemId === item.id }} onPress={() => { setReturnItemId(item.id); setReturnQuantity('1'); setReturnRefund(String(Math.round(Number(item.lineTotal) / item.quantity * 100) / 100)); }} style={{ borderWidth: 1, borderColor: returnItemId === item.id ? colors.brand : colors.border, borderRadius: 10, padding: spacing.md }}><Text tone={returnItemId === item.id ? 'brand' : 'ink'}>{item.title} · متاح {item.quantity - Number(item.returnedQuantity ?? 0)}</Text></Pressable>)}</View></> : null}<Text tone="muted">الكمية المتاحة للمرتجع: {maxReturnQuantity}</Text><Field label="الكمية" value={returnQuantity} onChangeText={setReturnQuantity} keyboardType="number-pad"/><Text tone="muted" size={12}>الحد الأقصى للمبلغ لهذه الكمية: {formatMoney(maxReturnRefund, sale.currency)} (وفق قيمة بند الفاتورة بعد الخصم).</Text><Text tone="muted" strong>سبب الإرجاع</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{returnReasons.map(reason => <Pressable key={reason.value} accessibilityRole="radio" accessibilityState={{ selected: returnReason === reason.value }} onPress={() => setReturnReason(reason.value)} style={{ borderWidth: 1, borderColor: returnReason === reason.value ? colors.brand : colors.border, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}><Text tone={returnReason === reason.value ? 'brand' : 'ink'}>{reason.label}</Text></Pressable>)}</View><Field label="مبلغ الاسترداد" value={returnRefund} onChangeText={setReturnRefund} keyboardType="decimal-pad"/><Field label="ملاحظة سبب الإرجاع (اختياري)" value={returnNote} onChangeText={setReturnNote} multiline maxLength={500}/><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: restockedToInventory }} onPress={() => setRestockedToInventory(value => !value)}><Text tone="ink">{restockedToInventory ? '☑' : '☐'} إعادة الكمية إلى مخزون المنتج عند الإرجاع</Text></Pressable><PrimaryButton label="تأكيد تسجيل المرتجع" busy={actionBusy} disabled={actionBusy || maxReturnQuantity <= 0} onPress={() => void submitReturn()}/><PrimaryButton label="إلغاء" variant="secondary" disabled={actionBusy} onPress={() => setActionMode(null)}/></View> : null}</SectionCard>{sale.items?.length ? <SectionCard><Text tone="ink" strong size={16}>عناصر البيع</Text>{sale.items.map(item => <View key={item.id} style={{
        paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.xs
    }}><Text tone="ink" strong>{item.title}</Text><Text tone="muted">الكمية: {item.quantity} · سعر الوحدة: {formatMoney(item.unitPrice, sale.currency)}</Text><Text tone="brand" strong>الإجمالي: {formatMoney(item.lineTotal, sale.currency)}{item.returnedQuantity ? ` · مرتجع ${item.returnedQuantity}` : ''}</Text></View>)}</SectionCard> : null}{sale.payments?.length ? <SectionCard><Text tone="ink" strong size={16}>الدفعات المسجلة</Text>{sale.payments.map(payment => <View key={payment.id} style={{
        paddingVertical: spacing.sm, gap: spacing.xs
    }}><Text tone="ink" strong>{formatMoney(payment.amount, sale.currency)}</Text><Text tone="muted">{formatDate(payment.paidAt, 'dateTime')}{payment.method ? ` · ${domainLabel('paymentMethod', payment.method, 'وسيلة دفع أخرى')}` : ''}{payment.note ? ` · ${payment.note}` : ''}</Text></View>)}</SectionCard> : null}{sale.installments?.length ? <SectionCard><Text tone="ink" strong size={16}>جدول الأقساط</Text>{sale.installments.map(inst => <View key={inst.id} style={{
        paddingVertical: spacing.sm, gap: spacing.xs
    }}><Text tone="ink" strong>القسط {inst.installmentNo} · {formatMoney(inst.amount, sale.currency)}</Text><Text tone="muted">مدفوع {formatMoney(inst.paidAmount, sale.currency)} · الاستحقاق {formatDate(inst.dueDate, 'date')} · {domainLabel('installment', inst.status, 'حالة محدثة')}</Text></View>)}</SectionCard> : null}<PrimaryButton label="مشاركة ملخص البيع" variant="secondary" onPress={() => void shareText(`سوق غزة — ملخص بيع\nالفاتورة: ${receiptNumber || 'غير مرقمة'}\nالعنصر: ${sale.entityTitle}\nالنوع: ${domainLabel('saleEntity', sale.entityType, 'غير محدد')}\nالإجمالي: ${formatMoney(sale.totalPrice, sale.currency)}\nالمدفوع: ${formatMoney(sale.paidAmount, sale.currency)}\nالمتبقي: ${formatMoney(sale.dueAmount, sale.currency)}\nالتاريخ: ${formatDate(sale.soldAt)}`)}/><PrimaryButton label="عرض الفاتورة" variant="secondary" onPress={() => router.push({
        pathname: '/sales/[id]/receipt', params: { id }
    })}/><PrimaryButton label="تسجيل دفعة قسط" onPress={() => router.push('/installments')}/><PrimaryButton label="العودة إلى مبيعاتي" variant="secondary" onPress={() => router.push('/my-sales')}/></> : null}</PageShell>;
}
