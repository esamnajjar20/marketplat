import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppImage } from '@/components/AppImage';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSalesCostProducts, fetchSalesCostSettings, updateSalesCostSettings, updateSalesProductCost, type SalesCostProduct } from '@/features/sales/sales-extra.api';
import { formatMoney } from '@/lib/formatters';
import { AppHeader, EmptyState, ErrorState, LoadingState, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fontSizes, radius, spacing } from '@/theme/tokens';

export default function SalesCostsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [products, setProducts] = useState<SalesCostProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const load = useCallback(async (refresh = false) => {
    const token = getAccessToken();
    if (!token || !user?.id || isRestoring) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const settings = await fetchSalesCostSettings(token, undefined, user.id);
      setEnabled(settings.enabled);
      setSettingsLoaded(true);
      if (settings.enabled) setProducts(await fetchSalesCostProducts(token, undefined, user.id));
      else setProducts([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل إعدادات التكاليف.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAccessToken, isRestoring, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('ar');
    return term ? products.filter((item) => `${item.name} ${item.store?.name ?? ''}`.toLocaleLowerCase('ar').includes(term)) : products;
  }, [products, query]);

  const toggle = async (next: boolean) => {
    const token = getAccessToken();
    if (!token || !user?.id || busy) return;
    setBusy('settings'); setError('');
    try {
      const saved = await updateSalesCostSettings(next, token, csrfToken, user.id);
      setEnabled(saved.enabled);
      if (saved.enabled) setProducts(await fetchSalesCostProducts(token, undefined, user.id));
      else setProducts([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث إعدادات التكلفة.');
    } finally { setBusy(null); }
  };

  const save = async (product: SalesCostProduct) => {
    const token = getAccessToken();
    if (!token || !user?.id || busy) return;
    const raw = (drafts[product.id] ?? (product.costPrice == null ? '' : String(product.costPrice))).trim();
    let value: number | null = null;
    if (raw !== '') {
      value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) { setError('أدخل تكلفة صحيحة تساوي صفرًا أو أكثر.'); return; }
      value = Math.round(value * 100) / 100;
    }
    setBusy(product.id); setError('');
    try {
      await updateSalesProductCost(product.id, value, token, csrfToken, user.id);
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, costPrice: value } : item));
      setDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ تكلفة المنتج.');
    } finally { setBusy(null); }
  };

  if (isRestoring) return <SafeAreaView style={styles.safe}><LoadingState message="جارٍ استعادة الجلسة…" /></SafeAreaView>;
  if (!user) return <SafeAreaView style={styles.safe}><EmptyState title="سجّل الدخول لإدارة التكاليف" actionLabel="تسجيل الدخول" onAction={() => router.push('/login')} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <AppHeader title="التكلفة الحقيقية" />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}>
      <SectionCard>
        <Text style={styles.heading}>احتساب تكلفة المنتجات</Text>
        <Text style={styles.description}>حدد تكلفة المنتج مرة واحدة. تُستخدم التكلفة عند تسجيل المبيعات لحساب الربح، وتعديلها لا يغيّر تكلفة المبيعات السابقة.</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{enabled ? 'الميزة مفعّلة' : 'الميزة متوقفة'}</Text>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled, disabled: busy === 'settings' }} disabled={busy === 'settings'} onPress={() => void toggle(!enabled)} style={[styles.toggle, enabled && styles.toggleOn]}>
            <Text style={[styles.toggleText, enabled && styles.toggleTextOn]}>{busy === 'settings' ? '…' : enabled ? 'إيقاف' : 'تفعيل'}</Text>
          </Pressable>
        </View>
      </SectionCard>
      {loading ? <LoadingState message="جاري تحميل تكاليف المنتجات…" /> : error && !settingsLoaded ? <ErrorState title="تعذر تحميل التكاليف" description={error} onAction={() => void load()} /> : !enabled ? <EmptyState title="التكلفة الحقيقية متوقفة" description="لن تُعرض تكاليف المنتجات أو الأرباح حتى تعيد تفعيل الميزة." actionLabel="تفعيل الميزة" onAction={() => void toggle(true)} /> : <>
        <View style={styles.searchWrap}><TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن منتج أو متجر" placeholderTextColor={colors.muted} style={styles.search} returnKeyType="search" /></View>
        {error ? <ErrorState title="تعذر تنفيذ العملية" description={error} onAction={() => setError('')} /> : null}
        {filtered.length === 0 ? <EmptyState title="لا توجد منتجات مطابقة" description="أضف منتجات إلى متجرك أو غيّر عبارة البحث." actionLabel="إدارة المنتجات" onAction={() => router.push('/my-products')} /> : filtered.map((product) => {
          const draft = drafts[product.id] ?? (product.costPrice == null ? '' : String(product.costPrice));
          return <View key={product.id} style={styles.productCard}>
            {product.images?.[0] ? <AppImage uri={product.images[0]} style={styles.image} /> : <View style={styles.imagePlaceholder} />}
            <View style={styles.productBody}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.meta}>{product.store?.name ?? 'متجر'} · سعر البيع {formatMoney(product.price)}</Text>
              <View style={styles.editRow}>
                <TextInput value={draft} onChangeText={(value) => setDrafts((current) => ({ ...current, [product.id]: value }))} keyboardType="decimal-pad" placeholder="بدون تكلفة" placeholderTextColor={colors.muted} style={styles.costInput} accessibilityLabel={`تكلفة ${product.name}`} />
                <PrimaryButton label={busy === product.id ? 'جارٍ الحفظ…' : 'حفظ'} busy={busy === product.id} disabled={Boolean(busy)} onPress={() => void save(product)} />
              </View>
              <Text style={styles.meta}>التكلفة الحالية: {product.costPrice == null ? 'غير محددة' : formatMoney(product.costPrice)}</Text>
            </View>
          </View>;
        })}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const createStyles = (colors: ColorPalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.x4l },
  heading: { color: colors.ink, fontSize: fontSizes[17], fontWeight: '700', textAlign: 'right' }, description: { color: colors.muted, fontSize: fontSizes[13], lineHeight: 21, textAlign: 'right' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }, toggleLabel: { color: colors.ink, fontWeight: '700' }, toggle: { minWidth: 78, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, toggleOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand }, toggleText: { color: colors.muted, fontWeight: '700' }, toggleTextOn: { color: colors.brand },
  searchWrap: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md }, search: { minHeight: 46, color: colors.ink, textAlign: 'right' },
  productCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg }, image: { width: 76, height: 82, borderRadius: radius.md, backgroundColor: colors.border }, imagePlaceholder: { width: 76, height: 82, borderRadius: radius.md, backgroundColor: colors.brandSoft }, productBody: { flex: 1, gap: spacing.xs, alignItems: 'flex-end' }, productName: { color: colors.ink, fontSize: fontSizes[14], fontWeight: '700', textAlign: 'right' }, meta: { color: colors.muted, fontSize: fontSizes[11], textAlign: 'right' }, editRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, costInput: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.md, paddingHorizontal: spacing.sm, color: colors.ink, textAlign: 'left' },
});
