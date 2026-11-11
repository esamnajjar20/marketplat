import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';

import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppImage } from '@/components/AppImage';
import { AppIcon } from '@/components/Icons';
import { AppText as Text } from '@/components/ui/AppText';
import { Badge, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { formatMoney } from '@/lib/formatters';
import { toAppHref } from '@/lib/typed-navigation';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { fetchMixedRecommendations, type RecommendationItem } from './discovery.api';

type Kind = 'ad' | 'product' | 'service';
type FeedRow = { item: RecommendationItem; kind: Kind };

const THUMB_SIZE = 82;
const FEED_LIMIT = 18;

const KIND_LABEL: Record<Kind, string> = { ad: 'إعلان', product: 'منتج', service: 'خدمة' };
const KIND_GLYPH: Record<Kind, string> = { ad: '◇', product: '▣', service: '✦' };
const KIND_ROUTE: Record<Kind, string> = { ad: '/ads', product: '/products', service: '/services' };

function destination(row: FeedRow) {
  return `${KIND_ROUTE[row.kind]}/${encodeURIComponent(row.item.id)}`;
}

function title(row: FeedRow) {
  return row.item.title || row.item.name || 'عنصر في MarketPlat';
}

function subtitle(row: FeedRow) {
  if (row.kind === 'product') return row.item.store?.name || 'منتج من متجر';
  if (row.kind === 'service') return row.item.provider?.displayName || row.item.provider?.user?.name || 'مقدم خدمة';
  return row.item.user?.name || row.item.city || 'إعلان';
}

function price(row: FeedRow) {
  const raw = row.item.price;
  if (raw === null || raw === undefined || raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? formatMoney(n) : String(raw);
}

function heading(mode: 'trending' | 'forYou' | 'default') {
  if (mode === 'trending') return 'الرائج الآن';
  if (mode === 'forYou') return 'مخصّص لك';
  return 'مقترحات لك';
}

function intro(mode: 'trending' | 'forYou' | 'default', loggedIn: boolean) {
  if (mode === 'trending') return 'اكتشف إعلانات ومنتجات وخدمات رائجة على المنصة.';
  if (mode === 'forYou') {
    return loggedIn
      ? 'محتوى متنوع يُرتّب وفق توصيات المنصة وحسابك عند توفر بيانات كافية.'
      : 'سجّل الدخول لإتاحة التوصيات المرتبطة بحسابك.';
  }
  return loggedIn
    ? 'اقتراحات تستفيد من اهتماماتك عندما تتوفر بيانات كافية.'
    : 'اكتشف محتوى متنوعًا، وسجّل الدخول لتخصيص الاقتراحات.';
}

function FeedRowCard({ row }: { row: FeedRow }) {
  const { colors } = useAppTheme();
  const imageUri = row.item.images?.[0] || row.item.image || '';
  const priceLabel = price(row);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABEL[row.kind]}: ${title(row)}`}
      onPress={() => router.push(toAppHref(destination(row)))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {imageUri ? (
        <AppImage uri={imageUri} style={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: radius.md, backgroundColor: colors.border }} />
      ) : (
        <View
          style={{
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: radius.md,
            backgroundColor: colors.brandSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text size={28} style={{ color: colors.brandOnSoft }}>{KIND_GLYPH[row.kind]}</Text>
        </View>
      )}
      <View style={{ flex: 1, alignItems: 'flex-end', gap: spacing.xs }}>
        <Text numberOfLines={2} tone="ink" strong>{title(row)}</Text>
        <Text numberOfLines={1} tone="muted" size={12}>{subtitle(row)}</Text>
        {priceLabel ? <Text tone="brand" strong>{priceLabel}</Text> : null}
        <Badge label={KIND_LABEL[row.kind]} tone="muted" />
      </View>
      <AppIcon name="forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

export default function DiscoveryFeedScreen({ trending = false, forYou = false }: { trending?: boolean; forYou?: boolean }) {
  const { colors } = useAppTheme();
  const { accessToken, user, isRestoring } = useAuth();
  const mode = trending ? 'trending' : forYou ? 'forYou' : 'default';

  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const current = ++seq.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const data = await fetchMixedRecommendations(FEED_LIMIT, trending ? null : accessToken);
        if (current !== seq.current) return;
        setRows([
          ...(data.ads ?? []).map((item) => ({ item, kind: 'ad' as const })),
          ...(data.products ?? []).map((item) => ({ item, kind: 'product' as const })),
          ...(data.services ?? []).map((item) => ({ item, kind: 'service' as const })),
        ]);
      } catch (e) {
        if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المحتوى.');
      } finally {
        if (current === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, trending],
  );

  useEffect(() => {
    if (!isRestoring) void load();
    return () => {
      seq.current += 1;
    };
  }, [isRestoring, load]);

  let body;
  if (loading) {
    body = <LoadingState message="جاري تحميل المحتوى…" />;
  } else if (error && rows.length === 0) {
    body = <ErrorState description={error} onAction={() => void load()} />;
  } else if (rows.length === 0) {
    body = <EmptyState title="لا يوجد محتوى متاح حاليًا" description="جرّب التحديث بعد قليل." />;
  } else {
    body = (
      <>
        <Text tone="muted" style={{ textAlign: 'right', lineHeight: 20 }}>{intro(mode, Boolean(user))}</Text>
        {rows.map((row) => (
          <FeedRowCard key={`${row.kind}-${row.item.id}`} row={row} />
        ))}
      </>
    );
  }

  return (
    <PageShell
      title={heading(mode)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} colors={[colors.brand]} />}
    >
      {body}
    </PageShell>
  );
}
