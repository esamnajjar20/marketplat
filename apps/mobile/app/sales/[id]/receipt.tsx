import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSaleReceipt } from '@/features/sales/sales-extra.api';
import type { SaleRecord } from '@/features/sales/sales.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, spacing } from '@/theme/tokens';
import { formatDate, formatMoney } from '@/lib/formatters';
type ReceiptSale = SaleRecord & {
  items?: Array<{
    id: string;
    title: string;
    quantity: number;
    unitPrice: number | string;
    lineTotal: number | string;
  }>;
  payments?: Array<{
    id: string;
    amount: number | string;
    paidAt: string;
    method?: string;
  }>;
  note?: string | null;
};
export default function SaleReceiptScreen() {
  const { colors } = useAppTheme();
  const p = useLocalSearchParams<{
    id: string | string[];
  }>();
  const id = Array.isArray(p.id) ? p.id[0] : p.id;
  const { accessToken, user, isRestoring } = useAuth();
  const [sale, setSale] = useState<ReceiptSale | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!accessToken || !id) {
      setLoading(false);
      setError('معرّف البيع أو الجلسة غير متاحة.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await fetchSaleReceipt(id, accessToken);
      setSale(r.sale as ReceiptSale);
      setInvoice(r.invoiceNumber || r.sale.invoiceNumber || null);
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الفاتورة.');
    }
    finally {
      setLoading(false);
    }
  }, [accessToken, id]);
  useEffect(() => {
    if (!isRestoring)
      void load();
  }, [isRestoring, load]);
  if (isRestoring)
    return <PageShell title="فاتورة البيع"><Spinner color={colors.brand}/></PageShell>;
  if (!user)
    return <PageShell title="فاتورة البيع"><Notice>سجّل الدخول لعرض الفاتورة.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')}/></PageShell>;
  return <PageShell title="فاتورة البيع">{loading ? <Spinner color={colors.brand}/> : error ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} variant="secondary"/></> : sale ? <><SectionCard><Text style={{
    textAlign: 'center', fontSize: fontSizes[26], fontWeight: '700', color: colors.ink
  }}>سوق غزة</Text><Text style={{
    textAlign: 'center', fontSize: fontSizes[20], fontWeight: '700', color: colors.brand
  }}>فاتورة بيع</Text><Text style={{
    textAlign: 'center', color: colors.muted
  }}>رقم الفاتورة: {invoice || 'غير محدد'}</Text><View style={{
    height: 1, backgroundColor: colors.border, marginVertical: spacing.sm
  }}/><Text tone="ink">العميل: {sale.buyerName}</Text><Text tone="muted">نوع العنصر: {{
    PRODUCT: 'منتج', AD: 'إعلان', SERVICE: 'خدمة', FREE: 'عنصر مجاني'
  }[sale.entityType] || 'غير محدد'}</Text><Text tone="muted">حالة الدفع: {{
    PAID: 'مدفوع بالكامل', PARTIAL: 'مدفوع جزئيًا', UNPAID: 'غير مدفوع', OVERDUE: 'متأخر'
  }[sale.paymentStatus] || 'غير محددة'}</Text><Text tone="muted">التاريخ: {formatDate(sale.soldAt, 'date')}</Text><Text style={{
    textAlign: 'right', fontWeight: '700', fontSize: fontSizes[16], color: colors.ink, marginTop: spacing.sm
  }}>{sale.entityTitle}</Text>{sale.items?.map(item => <View key={item.id} style={{
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border
  }}><View style={{ flex: 1 }}><Text tone="ink" strong>{item.title}</Text><Text tone="muted">الكمية {item.quantity} × {formatMoney(item.unitPrice, sale.currency)}</Text></View><Text style={{
    fontWeight: '700', color: colors.ink
  }}>{formatMoney(item.lineTotal, sale.currency)}</Text></View>)}<View style={{
    height: 1, backgroundColor: colors.border, marginVertical: spacing.sm
  }}/>{[
    ['الإجمالي', sale.totalPrice], ['المدفوع', sale.paidAmount], ['المتبقي', sale.dueAmount], ['المسترد', sale.refundedAmount]
  ].map(([label, value]) => <View key={String(label)} style={{
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7
  }}><Text style={{ color: colors.muted }}>{label}</Text><Text style={{
    color: label === 'المتبقي' && Number(value) > 0 ? colors.danger : colors.ink, fontWeight: '700'
  }}>{formatMoney(value, sale.currency)}</Text></View>)}{sale.note ? <Text style={{
    textAlign: 'right', color: colors.muted, marginTop: spacing.sm
  }}>ملاحظات: {sale.note}</Text> : null}<Text style={{
    textAlign: 'center', fontSize: fontSizes[11], color: colors.muted, marginTop: spacing.md
  }}>نسخة عرض داخل التطبيق. لا تمثل مستندًا ضريبيًا معتمدًا.</Text></SectionCard><Notice tone="muted">هذه فاتورة عرض داخل التطبيق وليست مستندًا ضريبيًا معتمدًا. تتوفر المشاركة النصية، أما PDF والطباعة فلم يُفعّلا بعد.</Notice><PrimaryButton label="مشاركة ملخص الفاتورة" variant="secondary" onPress={() => void Share.share({ message: `سوق غزة — فاتورة بيع\nرقم الفاتورة: ${invoice || 'غير محدد'}\nالعنصر: ${sale.entityTitle}\nالعميل: ${sale.buyerName}\nالإجمالي: ${formatMoney(sale.totalPrice, sale.currency)}\nالمدفوع: ${formatMoney(sale.paidAmount, sale.currency)}\nالمتبقي: ${formatMoney(sale.dueAmount, sale.currency)}\nالتاريخ: ${formatDate(sale.soldAt, 'date')}` })}/><PrimaryButton label="العودة إلى تفاصيل البيع" onPress={() => router.replace({
    pathname: '/sales/[id]', params: { id }
  })}/></> : null}</PageShell>;
}
