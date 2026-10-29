/**
 * حالة المفضلة مع outbox — مستخرجة من شاشة الرئيسية لإعادة الاستخدام
 * في favorites.tsx / تفاصيل الإعلان / الرئيسية.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import {
  enqueueFavoriteState,
  readFavoriteAdIds,
  writeFavoriteAdIds,
} from '@/features/ads/favorites.store';
import { useStableCallback } from '@/hooks/useStableCallback';
import { logger } from '@/lib/logger';

export function useFavorites() {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const favoriteIdsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    readFavoriteAdIds(user?.id)
      .then((ids) => {
        if (!active) return;
        favoriteIdsRef.current = ids;
        setFavoriteIds(ids);
        setReady(true);
      })
      .catch((error) => {
        logger.warn('favorites', 'failed to load', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    favoriteIdsRef.current = favoriteIds;
  }, [favoriteIds]);

  const isFavorite = useCallback(
    (id: string) => favoriteIdsRef.current.includes(id) || favoriteIds.includes(id),
    [favoriteIds],
  );

  const toggleFavorite = useStableCallback(async (id: string) => {
    const previous = favoriteIdsRef.current;
    const wasFavorited = previous.includes(id);
    const favorited = !wasFavorited;
    const next = favorited ? [...previous, id] : previous.filter((item) => item !== id);
    favoriteIdsRef.current = next;
    setFavoriteIds(next);
    try {
      if (user?.id) {
        const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await enqueueFavoriteState({
          userId: user.id,
          adId: id,
          favorited,
          previousFavorited: wasFavorited,
          operationId,
        });
      }
      await writeFavoriteAdIds(next, user?.id);
    } catch (error) {
      const cached = await readFavoriteAdIds(user?.id).catch(() => previous);
      favoriteIdsRef.current = cached;
      setFavoriteIds(cached);
      Alert.alert(
        'تعذر حفظ المفضلة',
        error instanceof Error ? error.message : 'لم يتم حفظ التغيير على الجهاز.',
      );
    }
  });

  return {
    favoriteIds,
    ready,
    isFavorite,
    toggleFavorite,
  };
}
