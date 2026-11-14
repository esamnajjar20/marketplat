import { secureRandomToken } from '@/lib/operation-id';
import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney, formatNumber, formatDate as formatSharedDate } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { enqueueFavoriteState, listPendingFavoriteStates, readFavoriteAdIds, updateFavoriteAdId } from '@/features/ads/favorites.store';
import { setFavoriteAdState } from '@/features/ads/favorites.api';
import { ApiError } from '@/api/client';
import { fetchAdDetail, getCachedAdDetail, type AdDetail } from '@/features/ads/ads.api';
import { startConversationFromAd } from '@/features/messaging/messaging.api';
import { ShareButton } from '@/components/ui/ShareButton';
import { AppIcon } from '@/components/Icons';
import { MediaGallery } from '@/components/ui/MediaGallery';
import { SaveOfflineButton } from '@/components/ui/SaveOfflineButton';
import { Badge, DetailScaffold, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { fontSizes, spacing, typography, fontWeights, radius } from '@/theme/tokens';
import { domainLabel } from '@/lib/status-labels';

function formatPrice(price: AdDetail['price']): string {
  if (price === null || price === undefined || price === '') return 'السعر عند التواصل';
  const amount = Number(price);
  return Number.isFinite(amount)
    ? formatMoney(amount)
    : String(price);
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return formatSharedDate(date, 'date');
}

export default function AdDetailScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

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
  const [cacheNotice, setCacheNotice] = useState(false);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++loadSequence.current;
    if (!id) {
      setErrorMessage('رابط الإعلان غير مكتمل.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setCacheNotice(false);
    let hasCachedAd = false;
    try {
      const cached = await getCachedAdDetail(id);
      if (cached) {
        hasCachedAd = true;
        if (current === loadSequence.current) { setAd(cached); setLoading(false); }
      }
    } catch {
      /* Cache is optional; continue with network. */
    }
    try {
      const fresh = await fetchAdDetail(id);
      if (current === loadSequence.current) setAd(fresh);
    } catch (error) {
      if (current !== loadSequence.current) return;
      if (hasCachedAd) setCacheNotice(true);
      if (!hasCachedAd) {
        setErrorMessage(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : 'تعذر تحميل تفاصيل الإعلان.',
        );
      }
    } finally {
      if (current === loadSequence.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    void (async () => {
      try {
        const localIds = await readFavoriteAdIds(user?.id);
        const pending = user?.id ? await listPendingFavoriteStates(user.id) : [];
        if (!active) return;
        const matchingPending = pending.filter((entry) => entry.adId === id);
        const latestPending = matchingPending[matchingPending.length - 1];
        setIsFavorite(latestPending ? latestPending.favorited : localIds.includes(id));
      } catch {
        /* Local favorite state is best-effort; lifecycle bridge owns sync. */
      }
    })();
    return () => { active = false; };
  }, [id, user?.id]);

  const onToggleFavorite = useCallback(async () => {
    if (!accessToken) {
      setFavoriteMessage('لحفظ المفضلة ومزامنتها، سجّل الدخول أولًا.');
      return;
    }
    if (!id || favoriteBusy) return;
    setFavoriteBusy(true);
    setFavoriteMessage(null);
    const next = !isFavorite;
    try {
      const operationId = `fav-${Date.now()}-${secureRandomToken(8)}`;
      await setFavoriteAdState(id, next, accessToken, operationId, csrfToken);
      setIsFavorite(next);
      await updateFavoriteAdId(id, next, user?.id);
      setFavoriteMessage(next ? 'أُضيف الإعلان إلى المفضلة.' : 'أُزيل الإعلان من المفضلة.');
    } catch (error) {
      if (error instanceof ApiError && error.status === undefined && user?.id) {
        try {
          const operationId = `fav-${Date.now()}-${secureRandomToken(8)}`;
          await enqueueFavoriteState({
            userId: user.id,
            adId: id,
            favorited: next,
            previousFavorited: isFavorite,
            operationId,
          });
          setIsFavorite(next);
          await updateFavoriteAdId(id, next, user?.id);
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
      pushOnce('/login');
      return;
    }
    if (!id || startingConversation || (user?.id && ad?.user?.id === user.id)) return;
    setStartingConversation(true);
    setConversationMessage(null);
    try {
      const conversation = await startConversationFromAd(id, accessToken, csrfToken);
      pushOnce({ pathname: '/messages/[id]', params: { id: conversation.id } });
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
      right={ad ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'إزالة الإعلان من المفضلة' : 'إضافة الإعلان إلى المفضلة'}
            accessibilityState={{ selected: isFavorite, disabled: favoriteBusy }}
            disabled={favoriteBusy}
            onPress={() => { if (!accessToken) pushOnce('/login'); else void onToggleFavorite(); }}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.brandSoft }}
          >
            <AppIcon name={isFavorite ? 'favoriteActive' : 'favorite'} size={22} color={colors.brandOnSoft} />
          </Pressable>
          <ShareButton resource="ads" id={ad.id} title={ad.title} />
        </View>
      ) : undefined}
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
                {[ad.city, ad.category?.nameAr || ad.category?.name, domainLabel('adCondition', ad.condition, ad.condition || '')]
                  .filter(Boolean)
                  .join(' · ') || 'إعلان محلي'}
              </Text>
              {ad.isNegotiable ? <Badge label="السعر قابل للتفاوض" tone="brand" /> : null}
              {formatDate(ad.createdAt) ? (
                <Text style={styles.date}>تاريخ النشر: {formatDate(ad.createdAt)}</Text>
              ) : null}
              {typeof ad.views === 'number' ? (
                <Text style={styles.date}>المشاهدات: {formatNumber(ad.views)}</Text>
              ) : null}

              {favoriteMessage ? <Notice tone="muted">{favoriteMessage}</Notice> : null}
              {cacheNotice ? <Notice tone="muted">تعرض هذه البيانات نسخة محفوظة؛ تعذر التحقق من أحدث تحديث.</Notice> : null}
              {ad.status ? <Badge label={domainLabel('ad', ad.status, ad.status)} tone={ad.status === 'ACTIVE' ? 'success' : 'muted'} /> : null}
              {isOwner ? <PrimaryButton label="تعديل الإعلان" variant="secondary" onPress={() => pushOnce({ pathname: '/ad-editor', params: { id: ad.id } })} /> : null}
              <SaveOfflineButton id={ad.id} kind="ad" title={ad.title} payload={{ id: ad.id, title: ad.title, description: ad.description, price: ad.price, city: ad.city, condition: ad.condition, createdAt: ad.createdAt, images }} />
              {conversationMessage ? <Notice tone="error">{conversationMessage}</Notice> : null}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>وصف الإعلان</Text>
              <Text style={styles.description}>
                {ad.description?.trim() || 'لم يضف صاحب الإعلان وصفًا إضافيًا.'}
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
                    pushOnce({ pathname: '/profile/[id]', params: { id: ad.user.id } });
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
                يمكنك التواصل مع البائع عبر المراسلة داخل التطبيق.
              </Text>
              {!isOwner ? (
                <PrimaryButton
                  label="الإبلاغ عن الإعلان"
                  variant="ghost"
                  onPress={() =>
                    pushOnce({
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

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({  pad: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  price: { color: colors.brand, fontSize: fontSizes[24], fontWeight: fontWeights.bold, textAlign: 'right', letterSpacing: 0.2 },
  title: {
    color: colors.ink,
    fontSize: fontSizes[20],
    lineHeight: 28,
    fontWeight: fontWeights.bold,
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
