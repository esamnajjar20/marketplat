import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppImage } from '@/components/AppImage';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSalesCostProducts, fetchSalesCostSettings, updateSalesCostSettings, updateSalesProductCost, type SalesCostProduct } from '@/features/sales/sales-extra.api';
import { formatMoney } from '@/lib/formatters';
import { AppHeader, EmptyState, ErrorState, LoadingState, PrimaryButton, SectionCard } from '@/components/ui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { ScreenFrame } from '@/components/ui/ScreenFrame';

import { pushOnce } from '@/lib/navigation';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';

import { useAsyncResource } from '@/hooks/useAsyncResource';

type CostsData = { enabled: boolean; products: SalesCostProduct[] };

const EMPTY_COST_PRODUCTS: SalesCostProduct[] = [];

type CostRowProps = {
  product: SalesCostProduct;
  draft: string;
  saving: boolean;
  disabled: boolean;
  placeholderColor: string;
  styles: ReturnType<typeof createStyles>;
  onChangeDraft: (productId: string, value: string) => void;
  onSave: (product: SalesCostProduct) => void;
};

/** صف منتج: memo حتى لا تُعاد رسم كل الصفوف مع كل حرف يُكتب في حقل تكلفة واحد. */
const CostRow = memo(function CostRow({ product, draft, saving, disabled, placeholderColor, styles, onChangeDraft, onSave }: CostRowProps) {
  return <View style={styles.productCard}>
    {product.images?.[0] ? <AppImage uri={product.images[0]} variant="list" style={styles.image} /> : <View style={styles.imagePlaceholder} />}
    <View style={styles.productBody}>
      <Text style={styles.productName}>{product.name}</Text>
      <Text style={styles.meta}>{product.store?.name ?? 'متجر'} · سعر البيع {formatMoney(product.price)}</Text>
      <View style={styles.editRow}>
        <TextInput value={draft} onChangeText={(value) => onChangeDraft(product.id, value)} keyboardType="decimal-pad" placeholder="بدون تكلفة" placeholderTextColor={placeholderColor} style={styles.costInput} accessibilityLabel={`تكلفة ${product.name}`} />
        <PrimaryButton label={saving ? 'جارٍ الحفظ…' : 'حفظ'} busy={saving} disabled={disabled} onPress={() => onSave(product)} />
      </View>
      <Text style={styles.meta}>التكلفة الحالية: {product.costPrice == null ? 'غير محددة' : formatMoney(product.costPrice)}</Text>
    </View>
  </View>;
});

const costKey = (product: SalesCostProduct) => product.id;

export default function SalesCostsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [query, setQuery] = useState('');

  // دورة الجلب الموحّدة: الإعداد + المنتجات في مورد واحد (data = null حتى يصل الإعداد).
  const resource = useAsyncResource<CostsData>(
    async () => {
      const token = getAccessToken();
      if (!token || !user?.id) throw new Error('انتهت الجلسة. سجّل الدخول مجددًا.');
      const settings = await fetchSalesCostSettings(token, undefined, user.id);
      const rows = settings.enabled ? await fetchSalesCostProducts(token, undefined, user.id) : [];
      return { enabled: settings.enabled, products: rows };
    },
    {
      key: user?.id ?? '',
      manual: isRestoring || !user?.id,
      tag: 'sales-costs',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل إعدادات التكاليف.'),
    },
  );
  const { data, loading, refreshing, reload, setData } = resource;
  const enabled = data?.enabled ?? true;
  const products = data?.products ?? EMPTY_COST_PRODUCTS;
  const settingsLoaded = data !== null;
  const error = actionError || resource.error || '';
  const setEnabled = useCallback((value: boolean) => {
    setData((cur) => ({ enabled: value, products: cur?.products ?? [] }));
  }, [setData]);
  const setProducts = useCallback((value: SalesCostProduct[] | ((cur: SalesCostProduct[]) => SalesCostProduct[])) => {
    setData((cur) => {
      const base = cur?.products ?? [];
      return { enabled: cur?.enabled ?? true, products: typeof value === 'function' ? value(base) : value };
    });
  }, [setData]);
  const load = useCallback((refresh = false) => reload(refresh ? { soft: true } : undefined), [reload]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('ar');
    return term ? products.filter((item) => `${item.name} ${item.store?.name ?? ''}`.toLocaleLowerCase('ar').includes(term)) : products;
  }, [products, query]);

  const toggle = async (next: boolean) => {
    const token = getAccessToken();
    if (!token || !user?.id || busy) return;
    setBusy('settings'); setActionError('');
    try {
      const saved = await updateSalesCostSettings(next, token, csrfToken, user.id);
      setEnabled(saved.enabled);
      if (saved.enabled) setProducts(await fetchSalesCostProducts(token, undefined, user.id));
      else setProducts([]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر تحديث إعدادات التكلفة.');
    } finally { setBusy(null); }
  };

  const save = async (product: SalesCostProduct) => {
    const token = getAccessToken();
    if (!token || !user?.id || busy) return;
    const raw = (drafts[product.id] ?? (product.costPrice == null ? '' : String(product.costPrice))).trim();
    let value: number | null = null;
    if (raw !== '') {
      value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) { setActionError('أدخل تكلفة صحيحة تساوي صفرًا أو أكثر.'); return; }
      value = Math.round(value * 100) / 100;
    }
    setBusy(product.id); setActionError('');
    try {
      await updateSalesProductCost(product.id, value, token, csrfToken, user.id);
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, costPrice: value } : item));
      setDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر حفظ تكلفة المنتج.');
    } finally { setBusy(null); }
  };

  // معالجات ثابتة الهوية للصفوف (memo): save تُقرأ عبر ref حتى لا تتغيّر مع كل حرف.
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSaveRow = useCallback((product: SalesCostProduct) => { void saveRef.current(product); }, []);
  const onChangeDraft = useCallback((productId: string, value: string) => {
    setDrafts((current) => ({ ...current, [productId]: value }));
  }, []);
  const renderProduct = useCallback(({ item }: { item: SalesCostProduct }) => (
    <CostRow
      product={item}
      draft={drafts[item.id] ?? (item.costPrice == null ? '' : String(item.costPrice))}
      saving={busy === item.id}
      disabled={Boolean(busy)}
      placeholderColor={colors.muted}
      styles={styles}
      onChangeDraft={onChangeDraft}
      onSave={onSaveRow}
    />
  ), [drafts, busy, colors.muted, styles, onChangeDraft, onSaveRow]);
  const listExtraData = useMemo(() => ({ drafts, busy }), [drafts, busy]);
  const showRows = !loading && !(error && !settingsLoaded) && enabled;

  if (isRestoring) return <ScreenFrame><LoadingState message="جارٍ استعادة الجلسة…" /></ScreenFrame>;
  if (!user) return <ScreenFrame><EmptyState title="سجّل الدخول لإدارة التكاليف" actionLabel="تسجيل الدخول" onAction={() => pushOnce('/login')} /></ScreenFrame>;

  return <ScreenFrame>
    <AppHeader title="التكلفة الحقيقية" />
    <AppFlashList
      data={showRows ? filtered : EMPTY_COST_PRODUCTS}
      extraData={listExtraData}
      keyExtractor={costKey}
      renderItem={renderProduct}
      ItemSeparatorComponent={ListGapMd}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      ListHeaderComponent={<View style={styles.listHeader}>
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
          {error ? <ErrorState title="تعذر تنفيذ العملية" description={error} onAction={() => setActionError('')} /> : null}
          {filtered.length === 0 ? <EmptyState title="لا توجد منتجات مطابقة" description="أضف منتجات إلى متجرك أو غيّر عبارة البحث." actionLabel="إدارة المنتجات" onAction={() => pushOnce('/my-products')} /> : null}
        </>}
      </View>}
    />
  </ScreenFrame>;
}

const createStyles = (colors: ColorPalette) => StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: spacing.x4l }, listHeader: { gap: spacing.md, marginBottom: spacing.md },
  heading: { color: colors.ink, fontSize: fontSizes[17], fontWeight: fontWeights.bold, textAlign: 'right' }, description: { color: colors.muted, fontSize: fontSizes[13], lineHeight: 21, textAlign: 'right' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }, toggleLabel: { color: colors.ink, fontWeight: fontWeights.bold }, toggle: { minWidth: 78, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, toggleOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand }, toggleText: { color: colors.muted, fontWeight: fontWeights.bold }, toggleTextOn: { color: colors.brand },
  searchWrap: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md }, search: { minHeight: 46, color: colors.ink, textAlign: 'right' },
  productCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg }, image: { width: 76, height: 82, borderRadius: radius.md, backgroundColor: colors.border }, imagePlaceholder: { width: 76, height: 82, borderRadius: radius.md, backgroundColor: colors.brandSoft }, productBody: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' }, productName: { color: colors.ink, fontSize: fontSizes[14], fontWeight: fontWeights.bold, textAlign: 'right' }, meta: { color: colors.muted, fontSize: fontSizes[11], textAlign: 'right' }, editRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, costInput: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.md, paddingHorizontal: spacing.sm, color: colors.ink, textAlign: 'left' },
});
