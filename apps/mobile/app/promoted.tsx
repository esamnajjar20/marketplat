import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';
import { router } from 'expo-router';
import { fetchProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

function price(p: ProductSummary): string {
  const value = Number(p.effectivePrice?.price ?? p.discountPrice ?? p.price);
  return Number.isFinite(value)
    ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(value)} ₪`
    : 'السعر عند التواصل';
}

export default function PromotedScreen() {
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const seq = useRef(0);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    const current = ++seq.current;
    setLoading(true);
    setError('');
    setLoadingMore(false);
    try {
      const result = await fetchProducts({
        page: 1,
        limit: 24,
        hasPromotion: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      if (current !== seq.current) return;
      setItems(result.items);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (e) {
      if (current === seq.current) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل المنتجات المروجة.');
      }
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      seq.current += 1;
    };
  }, [load]);

  const more = async () => {
    if (loading || loadingMoreRef.current || page >= totalPages) return;
    loadingMoreRef.current = true;
    const current = seq.current;
    setLoadingMore(true);
    setError('');
    try {
      const result = await fetchProducts({
        page: page + 1,
        limit: 24,
        hasPromotion: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      if (current !== seq.current) return;
      setItems((old) => {
        const ids = new Set(old.map((x) => x.id));
        return [...old, ...result.items.filter((x) => !ids.has(x.id))];
      });
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (e) {
      if (current === seq.current) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد.');
      }
    } finally {
      loadingMoreRef.current = false;
      if (current === seq.current) setLoadingMore(false);
    }
  };

  return (
    <PageShell title="العروض والمنتجات المروجة" scroll={false}>
      <FlatList
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>
              منتجات مرتبطة بعروض ترويجية نشطة أو مجدولة حسب بيانات الخادم.
            </Text>
            {loading && items.length === 0 ? <ActivityIndicator color={colors.brand} /> : null}
            {error && items.length === 0 ? (
              <>
                <Notice>{error}</Notice>
                <PrimaryButton label="إعادة المحاولة" onPress={() => void load()} />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? <Notice tone="muted">لا توجد منتجات مروجة حاليًا.</Notice> : undefined
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/products/${encodeURIComponent(item.id)}`)}>
            <SectionCard>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14 }}>
                {item.images?.[0] ? (
                  <AppImage
                    uri={item.images[0]}
                    style={{ width: 92, height: 92, borderRadius: 14, backgroundColor: colors.border }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 14,
                      backgroundColor: colors.brandSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.brand, fontSize: 28 }}>◇</Text>
                  </View>
                )}
                <View style={{ flex: 1, alignItems: 'flex-end', gap: 7, paddingVertical: 3 }}>
                  <Text
                    style={{ color: colors.ink, fontWeight: '800', fontSize: 15, textAlign: 'right' }}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right' }}>
                    {item.store?.name || 'متجر'}
                  </Text>
                  <Text style={{ color: colors.brand, fontWeight: '900' }}>{price(item)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {item.availability === 'OUT_OF_STOCK' ? 'غير متوفر' : 'عرض ترويجي'}
                  </Text>
                </View>
              </View>
            </SectionCard>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ gap: 10, marginTop: 8 }}>
            {error && items.length > 0 ? <Notice>{error}</Notice> : null}
            {page < totalPages ? (
              <PrimaryButton
                label={loadingMore ? 'جارٍ تحميل المزيد…' : 'تحميل المزيد'}
                variant="secondary"
                busy={loadingMore}
                onPress={() => void more()}
              />
            ) : null}
          </View>
        }
      />
    </PageShell>
  );
}
