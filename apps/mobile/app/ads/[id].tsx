import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { acknowledgeFavoriteState, enqueueFavoriteState, listPendingFavoriteStates, readFavoriteAdIds, writeFavoriteAdIds } from '@/features/ads/favorites.store';
import { fetchFavoriteAdIds, setFavoriteAdState } from '@/features/ads/favorites.api';
import { ApiError } from '@/api/client';
import { fetchAdDetail, getCachedAdDetail } from '@/features/ads/ads.api';
import type { AdDetail } from '@/features/ads/ads.api';
import { startConversationFromAd } from '@/features/messaging/messaging.api';
import { shareMarketPlatResource } from '@/features/sharing/deep-links';
import { colors, radius, spacing } from '@/theme/tokens';

function formatPrice(price: AdDetail['price']): string {
  if (price === null || price === undefined || price === '') return 'السعر عند التواصل';
  const amount = Number(price);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount)} ₪`
    : String(price);
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(date);
}

export default function AdDetailScreen() {
  const { width } = useWindowDimensions();
  const { user, accessToken, csrfToken } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [ad, setAd] = useState<AdDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);
  const [startingConversation, setStartingConversation] = useState(false);
  const [conversationMessage, setConversationMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setErrorMessage('رابط الإعلان غير مكتمل.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    let hasCachedAd = false;
    try {
      const cached = await getCachedAdDetail(id);
      if (cached) {
        hasCachedAd = true;
        setAd(cached);
        setLoading(false);
      }
    } catch { /* Cache is optional; continue with network. */ }
    try {
      setAd(await fetchAdDetail(id));
    } catch (error) {
      if (!hasCachedAd) setErrorMessage(error instanceof ApiError || error instanceof Error
        ? error.message
        : 'تعذر تحميل تفاصيل الإعلان.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    void (async () => {
      try {
        const localIds = await readFavoriteAdIds(user?.id);
        if (active) setIsFavorite(localIds.includes(id));
      } catch { /* Local state is a best-effort offline hint. */ }
      if (!accessToken || !user?.id) return;
      try {
        // Drain this account's desired-state queue in FIFO order. A failure leaves
        // the row intact; the endpoint uses PUT desired-state semantics, not toggle.
        const pending = await listPendingFavoriteStates(user.id);
        for (const operation of pending) {
          try {
            await setFavoriteAdState(operation.adId, operation.favorited, accessToken, operation.operationId, csrfToken);
            await acknowledgeFavoriteState(user.id, operation.adId, operation.operationId);
          } catch { break; }
        }
        const serverIds = await fetchFavoriteAdIds(accessToken);
        const pendingAfterSync = await listPendingFavoriteStates(user.id);
        const merged = new Set(serverIds);
        for (const operation of pendingAfterSync) {
          if (operation.favorited) merged.add(operation.adId);
          else merged.delete(operation.adId);
        }
        const mergedIds = [...merged];
        await writeFavoriteAdIds(mergedIds, user?.id);
        if (active) setIsFavorite(merged.has(id));
      } catch { /* Keep cached state if offline; never claim a sync occurred. */ }
    })();
    return () => { active = false; };
  }, [accessToken, csrfToken, id, user?.id]);

  const onToggleFavorite = useCallback(async () => {
    if (!accessToken) {
      setFavoriteMessage('لحفظ المفضلة ومزامنتها، سجّل الدخول أولاً.');
      return;
    }
    if (!id || favoriteBusy) return;
    setFavoriteBusy(true);
    setFavoriteMessage(null);
    const next = !isFavorite;
    try {
      const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await setFavoriteAdState(id, next, accessToken, operationId, csrfToken);
      setIsFavorite(next);
      const ids = await readFavoriteAdIds(user?.id);
      await writeFavoriteAdIds(next ? [...ids, id] : ids.filter((item) => item !== id), user?.id);
      setFavoriteMessage(next ? 'أُضيف الإعلان إلى المفضلة.' : 'أُزيل الإعلان من المفضلة.');
    } catch (error) {
      // Queue only transport/time-out failures. Auth/validation/server business errors
      // must remain visible and must not be disguised as an offline success.
      if (error instanceof ApiError && error.status === undefined && user?.id) {
        try {
          const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          await enqueueFavoriteState({ userId: user.id, adId: id, favorited: next, previousFavorited: isFavorite, operationId });
          setIsFavorite(next);
          const ids = await readFavoriteAdIds(user?.id);
          await writeFavoriteAdIds(next ? [...ids, id] : ids.filter((item) => item !== id), user?.id);
          setFavoriteMessage('حُفظ التغيير على هذا الجهاز، وسيُزامَن عند عودة الاتصال.');
        } catch (queueError) {
          setFavoriteMessage(queueError instanceof Error ? queueError.message : 'تعذر حفظ التغيير محليًا.');
        }
      } else {
        setFavoriteMessage(error instanceof Error ? error.message : 'تعذر تحديث المفضلة. لم يتم تأكيد التغيير.');
      }
    } finally { setFavoriteBusy(false); }
  }, [accessToken, csrfToken, favoriteBusy, id, isFavorite, user?.id]);

  const images = (ad?.images ?? []).filter((url) => typeof url === 'string' && /^(https?:|file:|content:)/i.test(url));

  const onMessageSeller = useCallback(async () => {
    if (!accessToken) { router.push('/login'); return; }
    if (!id || startingConversation || (user?.id && ad?.user?.id === user.id)) return;
    setStartingConversation(true);
    setConversationMessage(null);
    try { const conversation = await startConversationFromAd(id, accessToken); router.push({ pathname: '/messages/[id]', params: { id: conversation.id } }); }
    catch (error) { setConversationMessage(error instanceof Error ? error.message : 'تعذر بدء المحادثة. حاول مرة أخرى.'); }
    finally { setStartingConversation(false); }
  }, [accessToken, ad?.user?.id, id, startingConversation, user?.id]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>→</Text>
        </Pressable>
        <Text style={styles.topTitle}>تفاصيل الإعلان</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="مشاركة الإعلان" onPress={() => { if (ad) void shareMarketPlatResource('ads', ad.id, ad.title); }} style={styles.backButton}><Text style={styles.link}>مشاركة</Text></Pressable>
      </View>
      {loading ? (
        <View style={styles.centerState}><ActivityIndicator size="large" color={colors.brand} /><Text style={styles.muted}>جاري تحميل تفاصيل الإعلان…</Text></View>
      ) : errorMessage ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>تعذر عرض الإعلان</Text>
          <Text style={styles.muted}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>إعادة المحاولة</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.link}>العودة للإعلانات</Text></Pressable>
        </View>
      ) : ad ? (
        <ScrollView contentContainerStyle={styles.content}>
          {images.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageGallery}>
              {images.map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={[styles.heroImage, { width }]} resizeMode="cover" accessibilityLabel={`صورة ${index + 1} للإعلان`} />)}
            </ScrollView>
          ) : <View style={styles.imagePlaceholder}><Text style={styles.placeholderIcon}>🛍️</Text><Text style={styles.muted}>لا توجد صور متاحة</Text></View>}

          <View style={styles.detailsCard}>
            <Text style={styles.price}>{formatPrice(ad.price)}</Text>
            <Text style={styles.title}>{ad.title}</Text>
            <Text style={styles.meta}>{[ad.city, ad.category?.nameAr || ad.category?.name, ad.condition].filter(Boolean).join(' · ') || 'إعلان محلي'}</Text>
            {ad.user?.id !== user?.id ? <><Pressable accessibilityRole="button" disabled={startingConversation} onPress={() => { void onMessageSeller(); }} style={[styles.messageSellerButton, startingConversation && styles.busyButton]}><Text style={styles.messageSellerButtonText}>{startingConversation ? 'جارٍ فتح المحادثة…' : '✉ مراسلة البائع'}</Text></Pressable>{conversationMessage ? <Text accessibilityLiveRegion="polite" style={styles.favoriteMessage}>{conversationMessage}</Text> : null}</> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'} disabled={favoriteBusy} onPress={() => { void onToggleFavorite(); }} style={[styles.favoriteButton, isFavorite && styles.favoriteButtonActive]}>
              <Text style={[styles.favoriteButtonText, isFavorite && styles.favoriteButtonTextActive]}>{favoriteBusy ? 'جارٍ تحديث المفضلة…' : isFavorite ? '♥ محفوظ في المفضلة' : '♡ أضف إلى المفضلة'}</Text>
            </Pressable>
            {favoriteMessage ? <Text accessibilityLiveRegion="polite" style={styles.favoriteMessage}>{favoriteMessage}</Text> : null}
            {ad.isNegotiable ? <Text style={styles.negotiable}>السعر قابل للتفاوض</Text> : null}
            {formatDate(ad.createdAt) ? <Text style={styles.date}>تاريخ النشر: {formatDate(ad.createdAt)}</Text> : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>وصف الإعلان</Text>
            <Text style={styles.description}>{ad.description?.trim() || 'لم يضف صاحب الإعلان وصفاً إضافياً.'}</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>معلومات البائع</Text>
            <Pressable accessibilityRole="button" disabled={!ad.user?.id} onPress={() => { if (ad.user?.id) router.push({ pathname: '/profile/[id]', params: { id: ad.user.id } }); }}><Text style={styles.sellerName}>{ad.user?.name?.trim() || 'بائع على MarketPlat'}  ↗</Text></Pressable>
            <Text style={styles.meta}>{ad.user?.city || ad.city || 'الموقع غير محدد'}</Text>
            {ad.sellerProfile?.verified ? <Text style={styles.verified}>✓ بائع موثّق</Text> : null}
            <Text style={styles.sellerNote}>بيانات الاتصال المباشر غير متاحة ضمن بيانات الإعلان الحالية.</Text>{ad.user?.id !== user?.id ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/report/[targetType]/[targetId]', params: { targetType: 'ads', targetId: ad.id } })} style={styles.favoriteButton}><Text style={styles.favoriteButtonText}>الإبلاغ عن الإعلان</Text></Pressable> : null}
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  topBar: { minHeight: 56, paddingHorizontal: spacing.lg, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.brand, fontSize: 28, fontWeight: '700' },
  topTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  content: { paddingBottom: 32, gap: spacing.md },
  imageGallery: { flexDirection: 'row-reverse' },
  heroImage: { height: 280, backgroundColor: colors.border },
  imagePlaceholder: { height: 230, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  placeholderIcon: { fontSize: 44 },
  detailsCard: { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  price: { color: colors.brand, fontSize: 23, fontWeight: '900', textAlign: 'right' },
  title: { color: colors.ink, fontSize: 21, lineHeight: 30, fontWeight: '800', textAlign: 'right' },
  meta: { color: colors.muted, fontSize: 13, textAlign: 'right', lineHeight: 20 },
  negotiable: { alignSelf: 'flex-end', color: colors.brandDark, backgroundColor: colors.brandSoft, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, overflow: 'hidden', fontSize: 12, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  sectionCard: { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'right' },
  description: { color: colors.ink, fontSize: 14, lineHeight: 25, textAlign: 'right' },
  sellerName: { color: colors.ink, fontSize: 15, fontWeight: '800', textAlign: 'right' },
  verified: { color: colors.brand, fontSize: 12, textAlign: 'right', fontWeight: '700' },
  sellerNote: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'right' },
  messageSellerButton: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginTop: spacing.sm },
  messageSellerButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  busyButton: { opacity: 0.65 },
  favoriteButton: { alignSelf: 'flex-end', borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.sm },
  favoriteButtonActive: { backgroundColor: colors.brandSoft },
  favoriteButtonText: { color: colors.brand, fontSize: 13, fontWeight: '800' },
  favoriteButtonTextActive: { color: colors.brandDark },
  favoriteMessage: { color: colors.muted, fontSize: 12, textAlign: 'right', lineHeight: 18 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  muted: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 21 },
  stateTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  primaryButton: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  link: { color: colors.brand, fontSize: 13, fontWeight: '700', padding: spacing.sm },
});
