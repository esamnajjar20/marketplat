import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { createSale } from '@/features/sales/sales.api';
import { fetchCustomers, type CustomerRow } from '@/features/sales/sales-extra.api';
import { fetchMyProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { fetchMyAds, type ManagedAd } from '@/features/ads/manage-ads.api';
import { fetchMyServiceListings, type ServiceListing } from '@/features/services/services.api';
import { ApiError } from '@/api/client';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { enqueueOfflineCreate } from '@/storage/outbox-manager';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/ui';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { formatMoney } from '@/lib/formatters';
import { showToast } from '@/lib/toast';

type SaleLine = { id: string; title: string; quantity: string; unitPrice: string };
type SingleEntityType = 'FREE' | 'PRODUCT' | 'AD' | 'SERVICE';
type PaymentMethod = 'CASH' | 'JAWWAL_PAY' | 'BANK_PALESTINE' | 'PALPAY' | 'CARD' | 'OTHER';
const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CASH', label: 'نقدًا' }, { value: 'JAWWAL_PAY', label: 'جوال باي' },
  { value: 'BANK_PALESTINE', label: 'بنك فلسطين' }, { value: 'PALPAY', label: 'PalPay' },
  { value: 'CARD', label: 'بطاقة' }, { value: 'OTHER', label: 'أخرى' },
];
const makeLine = (): SaleLine => ({ id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: '', quantity: '1', unitPrice: '' });
const money = (n: number) => formatMoney(n);
const num = (value: string) => Number(normalizeNumericInput(value));
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addMonths(dateValue: string, months: number): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay)));
  return date.toISOString();
}

export default function SaleCreateScreen() {
  const { colors } = useAppTheme();
  const { accessToken, csrfToken, user } = useAuth();
  const [mode, setMode] = useState<'single' | 'multiple'>('single');
  const [singleEntityType, setSingleEntityType] = useState<SingleEntityType>('FREE');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [ads, setAds] = useState<ManagedAd[]>([]);
  const [services, setServices] = useState<ServiceListing[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [modeCustomerPicker, setModeCustomerPicker] = useState(false);
  const [title, setTitle] = useState('');
  const [buyer, setBuyer] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [lines, setLines] = useState<SaleLine[]>([makeLine(), makeLine()]);
  const [paid, setPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [mixedPayments, setMixedPayments] = useState(false);
  const [secondPaymentMethod, setSecondPaymentMethod] = useState<PaymentMethod>('JAWWAL_PAY');
  const [secondPaymentAmount, setSecondPaymentAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [installmentCount, setInstallmentCount] = useState('0');
  const [firstInstallmentDate, setFirstInstallmentDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operationIdRef = useRef(createMobileOperationId('sale-create'));

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setReferenceLoading(true); setReferenceError('');
    void Promise.allSettled([
      fetchMyProducts(accessToken, '', { page: 1, limit: 50 }),
      fetchMyAds(accessToken),
      fetchMyServiceListings(accessToken),
      fetchCustomers(accessToken, '', 1, undefined, user?.id),
    ]).then(results => {
      if (!active) return;
      const [productResult, adResult, serviceResult, customerResult] = results;
      const errors: string[] = [];
      if (productResult.status === 'fulfilled') setProducts(productResult.value.items);
      else errors.push('المنتجات');
      if (adResult.status === 'fulfilled') setAds(adResult.value);
      else errors.push('الإعلانات');
      if (serviceResult.status === 'fulfilled') setServices(serviceResult.value);
      else errors.push('الخدمات');
      if (customerResult.status === 'fulfilled') setCustomers(customerResult.value.items);
      else errors.push('العملاء');
      if (errors.length) setReferenceError(`تعذر تحميل بعض القوائم: ${errors.join('، ')}. ما زال بإمكانك التسجيل اليدوي.`);
    }).finally(() => { if (active) setReferenceLoading(false); });
    return () => { active = false; };
  }, [accessToken, user?.id]);

  const parsedLines = useMemo(() => lines.map(line => ({
    title: line.title.trim(), quantity: num(line.quantity), unitPrice: num(line.unitPrice),
  })), [lines]);
  const multipleTotal = useMemo(() => parsedLines.reduce((sum, line) => sum + (Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice) ? line.quantity * line.unitPrice : 0), 0), [parsedLines]);
  const multipleQuantity = useMemo(() => parsedLines.reduce((sum, line) => sum + (Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0), 0), [parsedLines]);
  const singleQuantity = num(quantity);
  const singleUnitPrice = num(unitPrice);
  const total = mode === 'multiple' ? roundMoney(multipleTotal) : roundMoney(singleQuantity * singleUnitPrice);
  const parsedPaidAmount = num(paid || '0');
  const dueAmount = roundMoney(Number.isFinite(parsedPaidAmount) ? Math.max(0, total - parsedPaidAmount) : 0);
  const selectedProduct = products.find(item => item.id === selectedEntityId) ?? null;
  const selectedAd = ads.find(item => item.id === selectedEntityId) ?? null;
  const selectedService = services.find(item => item.id === selectedEntityId) ?? null;
  const entityChoices = singleEntityType === 'PRODUCT' ? products : singleEntityType === 'AD' ? ads : singleEntityType === 'SERVICE' ? services : [];

  const selectEntityType = (kind: SingleEntityType) => {
    setSingleEntityType(kind); setSelectedEntityId(''); setTitle(''); setUnitPrice(''); setError('');
  };
  const selectEntity = (id: string) => {
    setSelectedEntityId(id);
    if (singleEntityType === 'PRODUCT') {
      const item = products.find(value => value.id === id); if (!item) return;
      setTitle(item.name); setUnitPrice(String(item.effectivePrice?.amount ?? item.effectivePrice?.price ?? item.discountPrice ?? item.price));
    } else if (singleEntityType === 'AD') {
      const item = ads.find(value => value.id === id); if (!item) return;
      setTitle(item.title); setUnitPrice(item.price == null ? '' : String(item.price));
    } else if (singleEntityType === 'SERVICE') {
      const item = services.find(value => value.id === id); if (!item) return;
      setTitle(item.title); setUnitPrice(item.price == null ? '' : String(item.price));
    }
  };
  const selectCustomer = (item: CustomerRow) => {
    setCustomerId(item.id); setBuyer(item.name); setPhone(item.phone || ''); setModeCustomerPicker(false);
  };
  const updateLine = (id: string, patch: Partial<SaleLine>) => setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));

  const submit = async () => {
    if (!accessToken) { pushOnce('/login'); return; }
    const paidAmount = num(paid);
    if (buyer.trim().length < 2 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > total) {
      setError('تحقق من اسم المشتري والمبلغ المدفوع، ويجب ألا يتجاوز المدفوع إجمالي الفاتورة.'); return;
    }
    if (mixedPayments) {
      const second = num(secondPaymentAmount);
      if (!Number.isFinite(second) || second <= 0 || second >= paidAmount || paymentMethod === secondPaymentMethod) { setError('قيمة الدفعة الثانية يجب أن تكون أكبر من صفر وأقل من إجمالي المدفوع، مع اختيار وسيلتين مختلفتين.'); return; }
    }
    const installmentsN = num(installmentCount || '0');
    if (!Number.isInteger(installmentsN) || installmentsN < 0 || installmentsN > 60) { setError('عدد الأقساط يجب أن يكون بين صفر و60.'); return; }
    if (installmentsN > 0 && (dueAmount <= 0 || !isValidDateOnly(firstInstallmentDate))) { setError('أدخل تاريخ أول قسط حقيقيًا بصيغة YYYY-MM-DD، ويجب أن توجد قيمة متبقية للتقسيط.'); return; }
    if (dueDate && !isValidDateOnly(dueDate)) { setError('أدخل تاريخ استحقاق حقيقيًا بصيغة YYYY-MM-DD.'); return; }

    let payload: Record<string, unknown>;
    let lineTotal = total;
    if (mode === 'single') {
      const q = singleQuantity, price = singleUnitPrice;
      if (title.trim().length < 2 || !Number.isInteger(q) || q < 1 || !Number.isFinite(price) || price < 0) { setError('أدخل اسم السلعة وكمية صحيحة وسعر وحدة صالحًا.'); return; }
      if (singleEntityType !== 'FREE' && !selectedEntityId) { setError('اختر عنصرًا من القائمة المرتبطة أو غيّر نوع التسجيل إلى يدوي.'); return; }
      if (singleEntityType === 'PRODUCT' && selectedProduct?.stockQuantity != null && q > selectedProduct.stockQuantity) { setError(`الكمية المطلوبة أكبر من المخزون المتاح (${selectedProduct.stockQuantity}).`); return; }
      const image = selectedProduct?.images?.[0] || selectedAd?.images?.[0] || selectedService?.images?.[0];
      const linked = singleEntityType !== 'FREE';
      payload = {
        entityType: singleEntityType,
        ...(linked ? { entityId: selectedEntityId } : {}),
        entityTitle: title.trim(), quantity: q, unitPrice: price, currency: 'ILS',
        ...(image ? { entityImageUrl: image } : {}),
        ...(singleEntityType === 'PRODUCT' ? { items: [{ productId: selectedEntityId, quantity: q, unitPrice: price, discount: 0 }], ...(selectedProduct?.store?.id ? { storeId: selectedProduct.store.id } : {}) } : {}),
      };
    } else {
      const invalid = parsedLines.length < 2 || parsedLines.some(line => line.title.length < 1 || line.title.length > 300 || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0);
      if (invalid || total <= 0 || multipleQuantity < 2) { setError('أكمل اسم وكمية وسعر كل بند في الفاتورة المتعددة.'); return; }
      payload = { entityType: 'FREE', entityTitle: `${parsedLines[0].title} + ${parsedLines.length - 1} أصناف`, quantity: multipleQuantity, unitPrice: roundMoney(total / multipleQuantity), manualItems: parsedLines.map(line => ({ title: line.title, quantity: line.quantity, unitPrice: line.unitPrice })), currency: 'ILS' };
      lineTotal = roundMoney(parsedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    }
    if (!Number.isFinite(lineTotal) || lineTotal <= 0 || lineTotal > 99_999_999.99) { setError('إجمالي البيع يجب أن يكون رقمًا صالحًا بين 0.01 و99,999,999.99 (شيكل).'); return; }
    const paymentFields: Record<string, unknown> = {};
    if (paidAmount > 0) {
      if (mixedPayments) {
        const second = roundMoney(num(secondPaymentAmount));
        const first = roundMoney(paidAmount - second);
        paymentFields.payments = [
          { amount: first, method: paymentMethod },
          { amount: second, method: secondPaymentMethod },
        ];
      } else paymentFields.payment = { amount: paidAmount, method: paymentMethod };
    }
    const installments = installmentsN > 0 ? (() => {
      const cents = Math.round(dueAmount * 100); const base = Math.floor(cents / installmentsN); const remainder = cents - base * installmentsN;
      return Array.from({ length: installmentsN }, (_, index) => ({ installmentNo: index + 1, amount: (base + (index < remainder ? 1 : 0)) / 100, dueDate: addMonths(firstInstallmentDate, index) }));
    })() : undefined;
    payload = {
      ...payload,
      ...(customerId ? { customerId } : {}), buyerName: buyer.trim(), ...(phone.trim() ? { buyerPhone: phone.trim() } : {}),
      paidAmount: roundMoney(paidAmount), paymentStatus: paidAmount === 0 ? 'UNPAID' : paidAmount >= lineTotal ? 'PAID' : 'PARTIAL',
      ...(dueAmount > 0 && dueDate ? { dueDate: new Date(`${dueDate}T12:00:00.000Z`).toISOString() } : {}),
      ...paymentFields, ...(installments ? { installments } : {}),
      ...(note.trim() ? { note: note.trim() } : {}), soldAt: new Date().toISOString(),
    };
    setBusy(true); setError('');
    try {
      const net = await NetInfo.fetch(); const operationId = operationIdRef.current;
      if (net.isConnected !== true || net.isInternetReachable === false) {
        if (!user?.id) throw new Error('تعذر تحديد الحساب لحفظ البيع دون اتصال.');
        await enqueueOfflineCreate(String(user.id), operationId, 'create-sale', payload);
        operationIdRef.current = createMobileOperationId('sale-create');
        showToast('حُفظ البيع على الجهاز', 'لم يُسجّل البيع على الخادم بعد. سيُرسل عند عودة الإنترنت؛ لا تعتبره بيعًا مسجلًا حتى تظهر رسالة التأكيد.', 'info', { label: 'عرض العمليات', onPress: () => router.replace('/offline-queue') });
      } else {
        try {
          await createSale(payload, accessToken, csrfToken, operationId, user?.id);
          operationIdRef.current = createMobileOperationId('sale-create');
          showToast('تم تسجيل البيع', 'أكد الخادم تسجيل عملية البيع.', 'success', { label: 'عرض المبيعات', onPress: () => router.replace('/my-sales') });
        } catch (requestError) {
          if (requestError instanceof ApiError && requestError.status == null && user?.id) {
            await enqueueOfflineCreate(String(user.id), operationId, 'create-sale', payload);
            operationIdRef.current = createMobileOperationId('sale-create');
            showToast('حُفظ البيع للمزامنة', 'انقطع الاتصال قبل تأكيد النتيجة. احتُفظ بالمعرّف نفسه لمنع تكرار البيع، وسيؤكد التطبيق حالته بعد المزامنة.', 'warning', { label: 'عرض العمليات', onPress: () => router.replace('/offline-queue') });
            return;
          }
          if (requestError instanceof ApiError && requestError.status !== undefined && requestError.status >= 400 && requestError.status < 500) operationIdRef.current = createMobileOperationId('sale-create');
          throw requestError;
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل البيع.'); }
    finally { setBusy(false); }
  };

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brandSoft : colors.surface }}><Text style={{ color: selected ? colors.brand : colors.ink, fontWeight: selected ? fontWeights.bold : fontWeights.normal }}>{label}</Text></Pressable>;
  return <PageShell title="تسجيل عملية بيع">
    <Notice tone="muted">يمكنك تسجيل بيع يدوي أو ربطه بمنتج أو إعلان أو خدمة، مع اختيار عميل مسجل وتسجيل وسيلة دفع واحدة أو أكثر وجدولة الأقساط.</Notice>
    <View style={{ flexDirection: 'row', gap: spacing.md }}>{([{ value: 'single', label: 'بيع أحادي' }, { value: 'multiple', label: 'بيع متعدد الأصناف' }] as const).map(option => chip(option.label, mode === option.value, () => { setMode(option.value); setError(''); }, option.value))}</View>
    {mode === 'single' ? <>
      <Text tone="ink" strong>نوع العنصر</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{([['FREE','يدوي'],['PRODUCT','منتج'],['AD','إعلان'],['SERVICE','خدمة']] as [SingleEntityType,string][]).map(([value,label]) => chip(label, singleEntityType === value, () => selectEntityType(value), value))}</View>
      {singleEntityType !== 'FREE' ? <><Text tone="ink" strong>اختر العنصر</Text>{referenceLoading ? <Notice tone="muted">جارٍ تحميل العناصر…</Notice> : null}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{entityChoices.slice(0, 50).map(item => { const itemId = item.id; const label = 'name' in item ? item.name : item.title; return chip(label, selectedEntityId === itemId, () => selectEntity(itemId), itemId); })}</View>{entityChoices.length === 0 && !referenceLoading ? <Notice tone="muted">لا توجد عناصر متاحة في هذا القسم؛ اختر التسجيل اليدوي أو أضف عنصرًا أولًا.</Notice> : null}</> : null}
      <Field label="اسم السلعة أو الخدمة المباعة" value={title} onChangeText={setTitle} maxLength={300} editable={singleEntityType === 'FREE'} placeholder="اسم السلعة" />
      <Field label="الكمية" value={quantity} onChangeText={value => setQuantity(normalizeNumericInput(value))} keyboardType="numeric" />
      <Field label="سعر الوحدة (شيكل)" value={unitPrice} onChangeText={value => setUnitPrice(normalizeNumericInput(value))} keyboardType="numeric" placeholder="0.00" />
    </> : <>
      <View style={{ gap: spacing.md }}>{lines.map((line, index) => <View key={line.id} style={{ gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.ink, fontWeight: fontWeights.bold }}>الصنف {index + 1}</Text>{lines.length > 2 ? <Pressable accessibilityRole="button" onPress={() => setLines(current => current.filter(item => item.id !== line.id))}><Text style={{ color: colors.danger, fontWeight: fontWeights.bold }}>حذف الصنف</Text></Pressable> : null}</View>
        <Field label="اسم الصنف" value={line.title} onChangeText={value => updateLine(line.id, { title: value })} maxLength={300} placeholder="اسم السلعة أو الخدمة" />
        <Field label="الكمية" value={line.quantity} onChangeText={value => updateLine(line.id, { quantity: normalizeNumericInput(value) })} keyboardType="numeric" />
        <Field label="سعر الوحدة (شيكل)" value={line.unitPrice} onChangeText={value => updateLine(line.id, { unitPrice: normalizeNumericInput(value) })} keyboardType="numeric" placeholder="0.00" />
        <Text tone="muted" strong>إجمالي الصنف: {money(Math.max(0, num(line.quantity) || 0) * Math.max(0, num(line.unitPrice) || 0))}</Text>
      </View>)}</View>
      <PrimaryButton label="+ إضافة صنف" variant="secondary" disabled={lines.length >= 200} onPress={() => setLines(current => [...current, makeLine()])} />
      <View style={{ padding: spacing.md, backgroundColor: colors.brandSoft, borderRadius: radius.md, gap: spacing.sm }}><Text style={{ color: colors.brandOnSoft, textAlign: 'right', fontWeight: fontWeights.bold }}>عدد الأصناف: {lines.length}</Text><Text style={{ color: colors.brandOnSoft, textAlign: 'right', fontWeight: fontWeights.bold, fontSize: fontSizes[18] }}>إجمالي الفاتورة: {money(total)}</Text></View>
    </>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text tone="ink" strong>العميل</Text>{chip(modeCustomerPicker ? 'إخفاء العملاء' : 'اختيار عميل مسجل', modeCustomerPicker, () => setModeCustomerPicker(value => !value), 'customer-toggle')}</View>
    {modeCustomerPicker ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{customers.map(customer => chip(`${customer.name}${customer.phone ? ` · ${customer.phone}` : ''}`, customerId === customer.id, () => selectCustomer(customer), customer.id))}{customers.length === 0 ? <Text tone="muted">لا توجد نتائج في أول صفحة العملاء. يمكنك إدخال العميل يدويًا.</Text> : null}</View> : null}
    <Field label="اسم المشتري" value={buyer} onChangeText={value => { setBuyer(value); setCustomerId(''); }} maxLength={160} placeholder="اسم المشتري" />
    <Field label="هاتف المشتري (اختياري)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} placeholder="رقم الهاتف" />
    <Field label={`المبلغ المدفوع من إجمالي ${money(total)}`} value={paid} onChangeText={value => setPaid(normalizeNumericInput(value))} keyboardType="numeric" placeholder="0.00" />
    {num(paid || '0') > 0 ? <><Text tone="ink" strong>وسيلة الدفع</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{PAYMENT_METHODS.map(method => chip(method.label, paymentMethod === method.value, () => setPaymentMethod(method.value), method.value))}</View>
      {chip(mixedPayments ? 'إلغاء تعدد وسائل الدفع' : 'توزيع المدفوع على وسيلتين', mixedPayments, () => setMixedPayments(value => !value), 'mixed-payment')}
      {mixedPayments ? <><Field label="المبلغ عبر الوسيلة الثانية" value={secondPaymentAmount} onChangeText={value => setSecondPaymentAmount(normalizeNumericInput(value))} keyboardType="numeric" placeholder="0.00" /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{PAYMENT_METHODS.filter(method => method.value !== paymentMethod).map(method => chip(method.label, secondPaymentMethod === method.value, () => setSecondPaymentMethod(method.value), `second-${method.value}`))}</View><Text tone="muted">المبلغ الأول: {money(Math.max(0, num(paid) - num(secondPaymentAmount)))} · المبلغ الثاني: {money(Math.max(0, num(secondPaymentAmount)))}</Text></> : null}
    </> : null}
    {dueAmount > 0 ? <><Field label="تاريخ استحقاق الرصيد (اختياري، YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="2026-12-01" /><Field label="عدد الأقساط (0 بدون تقسيط)" value={installmentCount} onChangeText={value => setInstallmentCount(normalizeNumericInput(value))} keyboardType="numeric" placeholder="0" />{num(installmentCount) > 0 ? <Field label="تاريخ أول قسط (YYYY-MM-DD)" value={firstInstallmentDate} onChangeText={setFirstInstallmentDate} placeholder="2026-12-01" /> : null}<Text tone="muted">الرصيد المتبقي: {money(dueAmount)}{num(installmentCount) > 0 ? ` · قسط تقريبي: ${money(dueAmount / Math.max(1, num(installmentCount)))}` : ''}</Text></> : null}
    <Field label="ملاحظات (اختياري)" value={note} onChangeText={setNote} maxLength={1000} multiline placeholder="ملاحظات البيع" />
    {referenceError ? <Notice tone="muted">{referenceError}</Notice> : null}
    {error ? <Text tone="danger">{error}</Text> : null}
    <PrimaryButton label={busy ? 'جارٍ الحفظ…' : mode === 'multiple' ? 'تسجيل الفاتورة المتعددة' : 'تسجيل البيع'} onPress={() => void submit()} busy={busy} />
  </PageShell>;
}
