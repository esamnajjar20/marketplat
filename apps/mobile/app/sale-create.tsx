import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { createSale } from '@/features/sales/sales.api';
import { enqueueOfflineCreate } from '@/storage/entity-create-outbox';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/MobileUI';
import { colors, radius, spacing } from '@/theme/tokens';

type SaleLine = { id: string; title: string; quantity: string; unitPrice: string };
const makeLine = (): SaleLine => ({ id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: '', quantity: '1', unitPrice: '' });
const money = (n: number) => `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(n)} ₪`;

export default function SaleCreateScreen() {
  const { accessToken, csrfToken, user } = useAuth();
  const [mode, setMode] = useState<'single' | 'multiple'>('single');
  const [title, setTitle] = useState('');
  const [buyer, setBuyer] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [lines, setLines] = useState<SaleLine[]>([makeLine(), makeLine()]);
  const [paid, setPaid] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parsedLines = useMemo(() => lines.map(line => ({
    title: line.title.trim(), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
  })), [lines]);
  const multipleTotal = useMemo(() => parsedLines.reduce((sum, line) => sum + (Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice) ? line.quantity * line.unitPrice : 0), 0), [parsedLines]);
  const multipleQuantity = useMemo(() => parsedLines.reduce((sum, line) => sum + (Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0), 0), [parsedLines]);
  const total = mode === 'multiple' ? Math.round(multipleTotal * 100) / 100 : Math.round((Number(quantity) * Number(unitPrice)) * 100) / 100;

  const updateLine = (id: string, patch: Partial<SaleLine>) => setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
  const submit = async () => {
    if (!accessToken) { router.push('/login'); return; }
    const paidAmount = Number(paid);
    if (buyer.trim().length < 2 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > total) {
      setError('تحقق من اسم المشتري والمبلغ المدفوع، ويجب ألا يتجاوز المدفوع إجمالي الفاتورة.'); return;
    }
    let payload: Record<string, unknown>;
    if (mode === 'single') {
      const q = Number(quantity), price = Number(unitPrice);
      if (title.trim().length < 2 || !Number.isInteger(q) || q < 1 || !Number.isFinite(price) || price < 0) {
        setError('أدخل اسم السلعة وكمية صحيحة وسعر وحدة صالحًا.'); return;
      }
      payload = { entityType: 'FREE', entityTitle: title.trim(), quantity: q, unitPrice: price, currency: 'ILS' };
    } else {
      const invalid = parsedLines.length < 2 || parsedLines.some(line => line.title.length < 1 || line.title.length > 300 || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0);
      if (invalid || total < 0 || multipleQuantity < 2) { setError('أكمل اسم وصنف وكمية وسعر كل بند في الفاتورة المتعددة.'); return; }
      payload = {
        entityType: 'FREE', entityTitle: `${parsedLines[0].title} + ${parsedLines.length - 1} أصناف`,
        quantity: multipleQuantity, unitPrice: Math.round((total / multipleQuantity) * 100) / 100,
        manualItems: parsedLines.map(line => ({ title: line.title, quantity: line.quantity, unitPrice: line.unitPrice })), currency: 'ILS',
      };
    }
    if (!Number.isFinite(total) || total <= 0 || total > 99_999_999.99) { setError('إجمالي البيع يجب أن يكون رقمًا صالحًا بين 0.01 و99,999,999.99 ₪.'); return; }
    payload = { ...payload, buyerName: buyer.trim(), ...(phone.trim() ? { buyerPhone: phone.trim() } : {}), paidAmount,
      paymentStatus: paidAmount === 0 ? 'UNPAID' : paidAmount >= total ? 'PAID' : 'PARTIAL',
      ...(note.trim() ? { note: note.trim() } : {}), soldAt: new Date().toISOString() };
    setBusy(true); setError('');
    try {
      const net = await NetInfo.fetch();
      const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      if (net.isConnected !== true || net.isInternetReachable === false) {
        if (!user?.id) throw new Error('تعذر تحديد الحساب لحفظ البيع دون اتصال.');
        await enqueueOfflineCreate(String(user.id), id, 'create-sale', payload);
        Alert.alert('حُفظ البيع على الجهاز', 'لم يُسجّل البيع على الخادم بعد. سيُرسل عند عودة الإنترنت؛ لا تعتبره بيعًا مسجلًا حتى تظهر رسالة التأكيد.', [{ text: 'حسنًا', onPress: () => router.replace('/offline-queue') }]);
      } else {
        await createSale(payload, accessToken, csrfToken, id);
        Alert.alert('تم تسجيل البيع', 'أكد الخادم تسجيل عملية البيع.', [{ text: 'حسنًا', onPress: () => router.replace('/my-sales') }]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل البيع.'); }
    finally { setBusy(false); }
  };

  return <PageShell title="تسجيل عملية بيع">
    <Notice tone="muted">يمكنك تسجيل بيع لسلعة واحدة أو إنشاء فاتورة تضم عدة أصناف. الفاتورة المتعددة اليدوية لا تخصم مخزون المتجر تلقائيًا.</Notice>
    <View style={{ flexDirection: 'row-reverse', gap: spacing.md }}>
      {([{ value: 'single', label: 'بيع أحادي' }, { value: 'multiple', label: 'بيع متعدد الأصناف' }] as const).map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: mode === option.value }} onPress={() => { setMode(option.value); setError(''); }} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: mode === option.value ? colors.brand : colors.border, backgroundColor: mode === option.value ? colors.brandSoft : colors.surface }}><Text style={{ textAlign: 'center', color: mode === option.value ? colors.brand : colors.ink, fontWeight: '800' }}>{option.label}</Text></Pressable>)}
    </View>
    {mode === 'single' ? <>
      <Field label="اسم السلعة أو الخدمة المباعة" value={title} onChangeText={setTitle} maxLength={300} placeholder="اسم السلعة" />
      <Field label="الكمية" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
      <Field label="سعر الوحدة (₪)" value={unitPrice} onChangeText={setUnitPrice} keyboardType="numeric" placeholder="0.00" />
    </> : <>
      <View style={{ gap: spacing.md }}>
        {lines.map((line, index) => <View key={line.id} style={{ gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.ink, fontWeight: '900' }}>الصنف {index + 1}</Text>{lines.length > 2 ? <Pressable accessibilityRole="button" onPress={() => setLines(current => current.filter(item => item.id !== line.id))}><Text style={{ color: colors.danger, fontWeight: '800' }}>حذف الصنف</Text></Pressable> : null}</View>
          <Field label="اسم الصنف" value={line.title} onChangeText={value => updateLine(line.id, { title: value })} maxLength={300} placeholder="اسم السلعة أو الخدمة" />
          <Field label="الكمية" value={line.quantity} onChangeText={value => updateLine(line.id, { quantity: value })} keyboardType="numeric" />
          <Field label="سعر الوحدة (₪)" value={line.unitPrice} onChangeText={value => updateLine(line.id, { unitPrice: value })} keyboardType="numeric" placeholder="0.00" />
          <Text style={{ textAlign: 'right', color: colors.muted, fontWeight: '700' }}>إجمالي الصنف: {money(Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0))}</Text>
        </View>)}
      </View>
      <PrimaryButton label="+ إضافة صنف" variant="secondary" disabled={lines.length >= 200} onPress={() => setLines(current => [...current, makeLine()])} />
      <View style={{ padding: spacing.md, backgroundColor: colors.brandSoft, borderRadius: radius.md, gap: 6 }}><Text style={{ color: colors.brand, textAlign: 'right', fontWeight: '800' }}>عدد الأصناف: {lines.length}</Text><Text style={{ color: colors.brand, textAlign: 'right', fontWeight: '900', fontSize: 18 }}>إجمالي الفاتورة: {money(total)}</Text></View>
    </>}
    <Field label="اسم المشتري" value={buyer} onChangeText={setBuyer} maxLength={160} placeholder="اسم المشتري" />
    <Field label="هاتف المشتري (اختياري)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} placeholder="رقم الهاتف" />
    <Field label={`المبلغ المدفوع من إجمالي ${money(total)}`} value={paid} onChangeText={setPaid} keyboardType="numeric" placeholder="0.00" />
    <Field label="ملاحظات (اختياري)" value={note} onChangeText={setNote} maxLength={1000} multiline placeholder="ملاحظات البيع" />
    {error ? <Text style={{ color: colors.danger, textAlign: 'right' }}>{error}</Text> : null}
    <PrimaryButton label={busy ? 'جارٍ الحفظ…' : mode === 'multiple' ? 'تسجيل الفاتورة المتعددة' : 'تسجيل البيع'} onPress={() => void submit()} busy={busy} />
  </PageShell>;
}
