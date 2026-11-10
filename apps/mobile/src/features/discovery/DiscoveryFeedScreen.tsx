import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMixedRecommendations, type RecommendationItem } from './discovery.api';
import { fontSizes, radius, spacing } from '@/theme/tokens';
import { AppImage } from '@/components/AppImage';
import { toAppHref } from '@/lib/typed-navigation';
import { formatMoney } from '@/lib/formatters';

type Kind = 'ad' | 'product' | 'service';
type FeedRow = { item: RecommendationItem; kind: Kind };
function destination(row: FeedRow) { return row.kind === 'ad' ? `/ads/${encodeURIComponent(row.item.id)}` : row.kind === 'product' ? `/products/${encodeURIComponent(row.item.id)}` : `/services/${encodeURIComponent(row.item.id)}`; }
function title(row: FeedRow) { return row.item.title || row.item.name || 'عنصر في MarketPlat'; }
function subtitle(row: FeedRow) { return row.kind === 'product' ? row.item.store?.name || 'منتج من متجر' : row.kind === 'service' ? row.item.provider?.displayName || row.item.provider?.user?.name || 'مقدم خدمة' : row.item.user?.name || row.item.city || 'إعلان'; }
function price(row: FeedRow) { if (row.item.price === null || row.item.price === undefined || row.item.price === '') return ''; const n = Number(row.item.price); return Number.isFinite(n) ? formatMoney(n) : String(row.item.price); }
export default function DiscoveryFeedScreen({ trending = false, forYou = false }: { trending?: boolean; forYou?: boolean }) {
  const { colors } = useAppTheme();

  const { accessToken, user, isRestoring } = useAuth();
  const [rows, setRows] = useState<FeedRow[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const seq = useRef(0);
  const load = useCallback(async (refresh = false) => { const current = ++seq.current; if (refresh) setRefreshing(true); else setLoading(true); setError(''); try { const data = await fetchMixedRecommendations(18, trending ? null : accessToken); if (current !== seq.current) return; const merged: FeedRow[] = [...(data.ads ?? []).map(item => ({ item, kind: 'ad' as const })), ...(data.products ?? []).map(item => ({ item, kind: 'product' as const })), ...(data.services ?? []).map(item => ({ item, kind: 'service' as const }))]; setRows(merged); } catch (e) { if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المحتوى.'); } finally { if (current === seq.current) { setLoading(false); setRefreshing(false); } } }, [accessToken, trending]);
  useEffect(() => { if (!isRestoring) void load(); return () => { seq.current += 1; }; }, [isRestoring, load]);
  return <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 36 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><Pressable accessibilityRole="button" onPress={() => goBack()} style={{ padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}><AppIcon name="back" size={22} color={colors.brand} /></Pressable><View style={{ flex: 1, gap: spacing.xs }}><Text tone="ink" strong size={24}>{trending ? 'الرائج الآن' : forYou ? 'مخصّص لك' : 'مقترحات لك'}</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 20 }}>{trending ? 'اكتشف إعلانات ومنتجات وخدمات رائجة على المنصة.' : forYou ? (user ? 'محتوى متنوع يُرتّب وفق توصيات المنصة وحسابك عند توفر بيانات كافية.' : 'سجّل الدخول لإتاحة التوصيات المرتبطة بحسابك.') : user ? 'اقتراحات تستفيد من اهتماماتك عندما تتوفر بيانات كافية.' : 'اكتشف محتوى متنوعًا، وسجّل الدخول لتخصيص الاقتراحات.'}</Text></View></View>
    {loading ? <Spinner size="large" color={colors.brand} /> : error && rows.length === 0 ? <View style={{ padding: 20, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md }}><Text tone="ink" strong>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text tone="brand" strong>إعادة المحاولة</Text></Pressable></View> : rows.length === 0 ? <Text style={{ textAlign: 'center', color: colors.muted, padding: spacing.xl }}>لا يوجد محتوى متاح حاليًا.</Text> : rows.map((row, i) => <Pressable accessibilityRole="button" key={`${row.kind}-${row.item.id}-${i}`} onPress={() => router.push(toAppHref(destination(row)))} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {row.item.images?.[0] || row.item.image ? <AppImage uri={row.item.images?.[0] || row.item.image || ''} style={{ width: 82, height: 82, borderRadius: 12, backgroundColor: colors.border }} /> : <View style={{ width: 82, height: 82, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: fontSizes[28], color: colors.brandOnSoft }}>{row.kind === 'ad' ? '◇' : row.kind === 'product' ? '▣' : '✦'}</Text></View>}
      <View style={{ flex: 1, alignItems: 'flex-end', gap: 5 }}><Text numberOfLines={2} tone="ink" strong>{title(row)}</Text><Text numberOfLines={1} tone="muted" size={12}>{subtitle(row)}</Text>{price(row) ? <Text style={{ color: colors.brand, fontWeight: '700' }}>{price(row)}</Text> : null}<Text style={{ color: colors.muted, fontSize: fontSizes[11] }}>{row.kind === 'ad' ? 'إعلان' : row.kind === 'product' ? 'منتج' : 'خدمة'}</Text></View><AppIcon name="forward" size={20} color={colors.muted} />
    </Pressable>)}
  </ScrollView>;
}
