import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import {
  acknowledgeFavoriteState,
  enqueueFavoriteState,
  listPendingFavoriteStates,
  readFavoriteAdIds,
  writeFavoriteAdIds,
} from '@/features/ads/favorites.store';
import { fetchFavoriteAdIds, setFavoriteAdState } from '@/features/ads/favorites.api';
import { ApiError } from '@/api/client';
import { fetchAdDetail, getCachedAdDetail } from '@/features/ads/ads.api';
import type { AdDetail } from '@/features/ads/ads.api';
import { startConversationFromAd } from '@/features/messaging/messaging.api';
import { ShareButton } from '@/components/ui/ShareButton';
import { MediaGallery } from '@/components/ui/MediaGallery';
import { SaveOfflineButton } from '@/components/ui/SaveOfflineButton';
import {
  Badge,
  DetailScaffold,
  Notice,
  PrimaryButton,
  SectionCard,
} from '@/components/MobileUI';
import { colors, elevation, radius, spacing, typography } from '@/theme/tokens';

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
    } catch {
      /* Cache is optional; continue with network. */
    }
    try {
      setAd(await fetchAdDetail(id));
    } catch (error) {
      if (!hasCachedAd) {
        setErrorMessage(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : 'تعذر تحميل تفاصيل الإعلان.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    if (!id) return () => {
      active = false;
    };
    void (async () => {
      try {
        const localIds = await readFavoriteAdIds(user?.id);
        if (active) setIsFavorite(localIds.includes(id));
      } catch {
        /* Local state is a best-effort offline hint. */
      }
      if (!accessToken || !user?.id) return;
      try {
        const pending = await listPendingFavoriteStates(user.id);
        for (const operation of pending) {
          if (!active) return;
          try {
            await setFavoriteAdState(
              operation.adId,
              operation.favorited,
              accessToken,
              operation.operationId,
              csrfToken,
            );
            await acknowledgeFavoriteState(user.id, operation.adId, operation.operationId);
          } catch {
            break;
          }
        }
        const serverIds = await fetchFavoriteAdIds(accessToken);
        if (!active) return;
        const pendingAfterSync = await listPendingFavoriteStates(user.id);
        if (!active) return;
        const merged = new Set(serverIds);
        for (const operation of pendingAfterSync) {
          if (operation.favorited) merged.add(operation.adId);
          else merged.delete(operation.adId);
        }
        const mergedIds = [...merged];
        await writeFavoriteAdIds(mergedIds, user?.id);
        if (active) setIsFavorite(merged.has(id));
      } catch {
        /* Keep cached state if offline. */
      }
    })();
    return () => {
      active = false;
    };
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
      await writeFavoriteAdIds(
        next ? [...ids, id] : ids.filter((item) => item !== id),
        user?.id,
      );
      setFavoriteMessage(next ? 'أُضيف الإعلان إلى المفضلة.' : 'أُزيل الإعلان من المفضلة.');
    } catch (error) {
      if (error instanceof ApiError && error.status === undefined && user?.id) {
        try {
          const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          await enqueueFavoriteState({
            userId: user.id,
            adId: id,
            favorited: next,
            previousFavorited: isFavorite,
            operationId,
          });
          setIsFavorite(next);
          const ids = await readFavoriteAdIds(user?.id);
          await writeFavoriteAdIds(
            next ? [...ids, id] : ids.filter((item) => item !== id),
            user?.id,
          );
          setFavoriteMessage('حُفظ التغيير على هذا الجهاز، وسيُزامَن عند عودة الاتصال.');
        } catch (queueError) {
          setFavoriteMessage(
            queueError instanceof Error ? queueError.message : 'تعذر حفظ التغيير محليًا.',
          );
        }
      } else {
        setFavoriteMessage(
          error instanceof Error ? error.message : 'تعذر تحديث المفضلة. لم يتم تأكيد التغيير.',
        );
      }
    } finally {
      setFavoriteBusy(false);
    }
  }, [accessToken, csrfToken, favoriteBusy, id, isFavorite, user?.id]);

  const images = (ad?.images ?? []).filter(
    (url) => typeof url === 'string' && /^(https?:|file:|content:)/i.test(url),
  );

  const onMessageSeller = useCallback(async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    if (!id || startingConversation || (user?.id && ad?.user?.id === user.id)) return;
    setStartingConversation(true);
    setConversationMessage(null);
    try {
      const conversation = await startConversationFromAd(id, accessToken, csrfToken);
      router.push({ pathname: '/messages/[id]', params: { id: conversation.id } });
    } catch (error) {
      setConversationMessage(
        error instanceof Error ? error.message : 'تعذر بدء المحادثة. حاول مرة أخرى.',
      );
    } finally {
      setStartingConversation(false);
    }
  }, [accessToken, ad?.user?.id, csrfToken, id, startingConversation, user?.id]);

  const isOwner = !!user?.id && ad?.user?.id === user.id;

  const footer =
    ad && !isOwner ? (
      <PrimaryButton
        label={startingConversation ? 'جارٍ فتح المحادثة…' : 'مراسلة البائع'}
        onPress={() => {
          void onMessageSeller();
        }}
        busy={startingConversation}
      />
    ) : null;

  return (
    <DetailScaffold
      title="تفاصيل الإعلان"
      right={ad ? <ShareButton resource="ads" id={ad.id} title={ad.title} /> : undefined}
      loading={loading}
      loadingMessage="جاري تحميل تفاصيل الإعلان…"
      error={errorMessage}
      onRetry={() => {
        void load();
      }}
      footer={footer}
    >
      {ad ? (
        <>
          <MediaGallery images={images} title={ad.title} />

          <View style={styles.pad}>
            <SectionCard>
              <Text style={styles.price}>{formatPrice(ad.price)}</Text>
              <Text style={styles.title}>{ad.title}</Text>
              <Text style={styles.meta}>
                {[ad.city, ad.category?.nameAr || ad.category?.name, ad.condition]
                  .filter(Boolean)
                  .join(' · ') || 'إعلان محلي'}
              </Text>
              {ad.isNegotiable ? <Badge label="السعر قابل للتفاوض" tone="brand" /> : null}
              {formatDate(ad.createdAt) ? (
                <Text style={styles.date}>تاريخ النشر: {formatDate(ad.createdAt)}</Text>
              ) : null}
              {typeof ad.views === 'number' ? (
                <Text style={styles.date}>المشاهدات: {new Intl.NumberFormat('ar').format(ad.views)}</Text>
              ) : null}

              <PrimaryButton
                label={
                  favoriteBusy
                    ? 'جارٍ تحديث المفضلة…'
                    : isFavorite
                      ? 'محفوظ في المفضلة'
                      : 'أضف إلى المفضلة'
                }
                onPress={() => {
                  void onToggleFavorite();
                }}
                busy={favoriteBusy}
                variant="secondary"
              />
              {favoriteMessage ? <Notice tone="muted">{favoriteMessage}</Notice> : null}
              <SaveOfflineButton id={ad.id} kind="ad" title={ad.title} payload={{ id: ad.id, title: ad.title, description: ad.description, price: ad.price, city: ad.city, condition: ad.condition, createdAt: ad.createdAt, images }} />
              {conversationMessage ? <Notice tone="error">{conversationMessage}</Notice> : null}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>وصف الإعلان</Text>
              <Text style={styles.description}>
                {ad.description?.trim() || 'لم يضف صاحب الإعلان وصفاً إضافياً.'}
              </Text>
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>نصائح السلامة</Text>
              <Text style={styles.description}>التقِ بالبائع في مكان عام وآمن، وافحص السلعة قبل الدفع. لا تشارك كلمات المرور أو رموز التحقق، وتجنب التحويل المسبق إلى جهة لا تثق بها. احتفظ بالمحادثة وإثبات الدفع.</Text>
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>معلومات البائع</Text>
              <Pressable
                accessibilityRole="button"
                disabled={!ad.user?.id}
                onPress={() => {
                  if (ad.user?.id) {
                    router.push({ pathname: '/profile/[id]', params: { id: ad.user.id } });
                  }
                }}
              >
                <Text style={styles.sellerName}>
                  {ad.user?.name?.trim() || 'بائع على MarketPlat'} ↗
                </Text>
              </Pressable>
              <Text style={styles.meta}>{ad.user?.city || ad.city || 'الموقع غير محدد'}</Text>
              {ad.sellerProfile?.verified ? <Badge label="بائع موثّق" tone="success" /> : null}
              <Text style={styles.sellerNote}>
                بيانات الاتصال المباشر غير متاحة ضمن بيانات الإعلان الحالية.
              </Text>
              {!isOwner ? (
                <PrimaryButton
                  label="الإبلاغ عن الإعلان"
                  variant="ghost"
                  onPress={() =>
                    router.push({
                      pathname: '/report/[targetType]/[targetId]',
                      params: { targetType: 'ads', targetId: ad.id },
                    })
                  }
                />
              ) : null}
            </SectionCard>
          </View>
        </>
      ) : null}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  headerAction: { color: colors.brand, ...typography.captionStrong },
  pad: { paddingHorizontal: spacing.md, gap: spacing.md },
  price: { color: colors.brand, fontSize: 22, fontWeight: '900', textAlign: 'right' },
  title: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'right',
  },
  meta: { color: colors.muted, ...typography.caption, textAlign: 'right' },
  date: { color: colors.muted, ...typography.caption, textAlign: 'right' },
  sectionTitle: { color: colors.ink, ...typography.subtitle, textAlign: 'right' },
  description: {
    color: colors.ink,
    ...typography.body,
    lineHeight: 24,
    textAlign: 'right',
  },
  sellerName: { color: colors.ink, ...typography.bodyStrong, textAlign: 'right' },
  sellerNote: { color: colors.muted, ...typography.caption, textAlign: 'right', lineHeight: 19 },
});
