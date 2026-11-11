import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { cancelPromotion, createPromotion, fetchMyPromotions, type StorePromotion } from '@/features/commerce/store-management.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { statusLabel } from '@/lib/status-labels';
import { formatSafeDate } from '@/lib/date-format';
import { showToast } from '@/lib/toast';
import { fontWeights, radius, spacing } from '@/theme/tokens';
const futureDate = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const datePresets = [{
    days: 7, label: '7 أيام'
  }, {
    days: 14, label: '14 يومًا'
  }, {
    days: 30, label: '30 يومًا'
  }] as const;
export default function StorePromotionsScreen() {
  const { colors } = useAppTheme();
  const { getAccessToken, csrfToken, isRestoring } = useAuth();
  const [items, setItems] = useState<StorePromotion[]>([]);
  const hasLoadedRef = useRef(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotalPages, setProductsTotalPages] = useState(1);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [productId, setProductId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [value, setValue] = useState('10');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 60000).toISOString());
  const [endsAt, setEndsAt] = useState(futureDate(7));
  const [maxUses, setMaxUses] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (isRestoring)
      return;
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current)
      setLoading(true);
    setError('');
    try {
      const [aR, pR] = await Promise.allSettled([fetchMyPromotions(token), fetchMyProducts(token)]);
      if (aR.status === 'rejected')
        throw aR.reason;
      setItems(aR.value);
      if (pR.status === 'fulfilled') {
        setProducts(pR.value.items);
        setProductsPage(pR.value.page);
        setProductsTotalPages(pR.value.totalPages);
        setProductId(v => v || pR.value.items[0]?.id || '');
      }
      else {
        setProducts([]);
        setProductId('');
        setError('تعذر تحميل قائمة المنتجات لإنشاء عرض جديد.');
      }
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل العروض.');
    }
    finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [getAccessToken, isRestoring]);
  useEffect(() => {
    void load();
  }, [load]);
  const loadMoreProducts = async () => {
    const token = getAccessToken();
    if (!token || loadingMoreProducts || productsPage >= productsTotalPages)
      return;
    setLoadingMoreProducts(true);
    setError('');
    try {
      const next = await fetchMyProducts(token, '', {
        page: productsPage + 1, limit: 50
      });
      setProducts(old => {
        const ids = new Set(old.map(p => p.id));
        return [...old, ...next.items.filter(p => !ids.has(p.id))];
      });
      setProductsPage(next.page);
      setProductsTotalPages(next.totalPages);
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من المنتجات.');
    }
    finally {
      setLoadingMoreProducts(false);
    }
  };
  const submit = async () => {
    const token = getAccessToken();
    if (!token)
      return pushOnce('/login');
    const n = Number(value);
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const max = maxUses.trim() ? Number(maxUses) : undefined;
    if (!productId || title.trim().length < 2 || !Number.isFinite(n) || n <= 0 || (type === 'PERCENTAGE' && n > 100) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || (max !== undefined && (!Number.isInteger(max) || max < 1))) {
      setError('تحقق من المنتج والعنوان وقيمة الخصم والتواريخ والحد الأقصى للاستخدام.');
      return;
    }
    if (start.getTime() <= Date.now()) {
      const bumped = new Date(Date.now() + 60000).toISOString();
      setStartsAt(bumped);
      setError('وقت البداية مضى أثناء ملء النموذج؛ حُدّث تلقائياً إلى الآن + دقيقة. اضغط "إنشاء العرض" مجدداً.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createPromotion({
        productId, title: title.trim(), description: description.trim() || undefined, discountType: type, discountValue: n, startsAt: start.toISOString(), endsAt: end.toISOString(), ...(max ? { maxUses: max } : {})
      }, token, csrfToken);
      setTitle('');
      setDescription('');
      await load();
      showToast('تم إنشاء العرض', 'تم إرسال العرض إلى الخادم.', 'success');
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء العرض.');
    }
    finally {
      setBusy(false);
    }
  };
  return <PageShell title="العروض الترويجية">{isRestoring ? <Notice tone="muted">جارٍ استعادة الجلسة…</Notice> : !getAccessToken() ? <><Notice>سجّل الدخول لإدارة عروض متجرك.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')}/></> : loading ? <Notice tone="muted">جارٍ تحميل العروض والمنتجات…</Notice> : <><SectionCard><Text tone="ink" strong size={17}>إنشاء عرض</Text><Text tone="ink" strong>اختر المنتج</Text><View style={{ gap: 6 }}>{products.map(p => <Pressable accessibilityRole="button" key={p.id} onPress={() => setProductId(p.id)} style={{
    padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: productId === p.id ? colors.brand : colors.border, backgroundColor: productId === p.id ? colors.brandSoft : colors.surface
  }}><Text tone="ink">{p.name} · {formatMoney(p.price)}</Text></Pressable>)}</View>{productsPage < productsTotalPages ? <PrimaryButton label={loadingMoreProducts ? 'جارٍ تحميل المنتجات…' : 'تحميل المزيد من المنتجات'} variant="secondary" busy={loadingMoreProducts} onPress={() => void loadMoreProducts()}/> : null}<Field label="عنوان العرض" value={title} onChangeText={setTitle} maxLength={200} placeholder="عنوان العرض"/><Field label="الوصف (اختياري)" value={description} onChangeText={setDescription} maxLength={500} multiline placeholder="تفاصيل العرض"/><View style={{
    flexDirection: 'row', gap: spacing.sm
  }}>{([['PERCENTAGE', 'خصم نسبة %'], ['FIXED_AMOUNT', 'خصم مبلغ (شيكل)']] as const).map(([v, l]) => <Pressable accessibilityRole="button" key={v} onPress={() => setType(v)} style={{
    flex: 1, padding: 10, borderRadius: radius.sm, backgroundColor: type === v ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: type === v ? colors.brand : colors.border
  }}><Text style={{
    textAlign: 'center', color: colors.ink, fontWeight: fontWeights.bold
  }}>{l}</Text></Pressable>)}</View><Field label="قيمة الخصم" value={value} onChangeText={setValue} keyboardType="numeric" placeholder="10"/><Text tone="ink" strong>بداية العرض: {formatSafeDate(startsAt, 'dateTime')}</Text><View style={{
    flexDirection: 'row', gap: spacing.sm
  }}>{[{
      hours: 0, label: 'بعد دقيقة', minutes: 1
    }, {
      hours: 1, label: 'بعد ساعة', minutes: 0
    }].map(p => <Pressable key={p.label} accessibilityRole="button" onPress={() => setStartsAt(new Date(Date.now() + (p.hours * 3600000) + (p.minutes * 60000)).toISOString())} style={{
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface
  }}><Text style={{
    color: colors.brand, fontWeight: fontWeights.bold
  }}>ابدأ {p.label}</Text></Pressable>)}</View><Text tone="ink" strong>نهاية العرض: {formatSafeDate(endsAt, 'dateTime')}</Text><View style={{
    flexDirection: 'row', gap: spacing.sm
  }}>{datePresets.map(p => <Pressable key={p.days} accessibilityRole="button" onPress={() => setEndsAt(futureDate(p.days))} style={{
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface
  }}><Text style={{
    color: colors.brand, fontWeight: fontWeights.bold
  }}>بعد {p.label}</Text></Pressable>)}</View><Field label="حد الاستخدام (اختياري)" value={maxUses} onChangeText={setMaxUses} keyboardType="numeric" placeholder="اتركه فارغًا دون حد"/><PrimaryButton label="إنشاء العرض" onPress={() => void submit()} busy={busy}/></SectionCard>{items.map(item => <SectionCard key={item.id}><Text tone="ink" strong size={15}>{item.title}</Text><Text tone="muted">{item.discountType === 'PERCENTAGE' ? `${item.discountValue}% خصم` : `${formatMoney(item.discountValue)} خصم`} · {statusLabel(item.status)} · الاستخدامات {item.usageCount}</Text><Text tone="muted">من {formatSafeDate(item.startsAt, 'dateTime')} إلى {formatSafeDate(item.endsAt, 'dateTime')}</Text>{!['CANCELLED', 'EXPIRED'].includes(item.status) ? <PrimaryButton label="إلغاء العرض" variant="danger" onPress={() => confirmAlert('إلغاء العرض', 'هل تريد إلغاء هذا العرض؟', [{
      text: 'رجوع', style: 'cancel'
    }, {
      text: 'إلغاء العرض', style: 'destructive', onPress: async () => {
        try {
          await cancelPromotion(item.id, getAccessToken() || '', csrfToken);
          await load();
        }
        catch (e) {
          setError(e instanceof Error ? e.message : 'تعذر إلغاء العرض.');
        }
      }
    }])}/> : null}</SectionCard>)}</>}{error ? <Notice>{error}</Notice> : null}</PageShell>;
}
