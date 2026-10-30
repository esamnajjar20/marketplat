import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { checkFavoriteEntity, toggleFavoriteEntity, type FavoriteEntityType } from '@/features/ads/favorites.api';
import { colors, radius, sizes, typography } from '@/theme/tokens';
export function FavoriteButton({ entityType, entityId, label = 'المفضلة' }: { entityType: FavoriteEntityType; entityId: string; label?: string }) {
  const { accessToken, csrfToken } = useAuth(); const [favorite, setFavorite] = useState(false); const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => { if (!accessToken || !entityId) { setFavorite(false); return; } try { setFavorite(await checkFavoriteEntity(entityType, entityId, accessToken)); } catch { /* Favorites status is optional; don't block the detail screen. */ } }, [accessToken, entityId, entityType]);
  useEffect(() => { void refresh(); }, [refresh]);
  const toggle = async () => { if (!accessToken) { router.push('/login'); return; } if (loading) return; setLoading(true); const previous = favorite; setFavorite(!previous); try { const action = await toggleFavoriteEntity(entityType, entityId, accessToken, csrfToken); setFavorite(action === 'added'); } catch (error) { setFavorite(previous); Alert.alert('تعذر تحديث المفضلة', error instanceof Error ? error.message : 'حاول مرة أخرى.'); } finally { setLoading(false); } };
  return <Pressable accessibilityRole="button" accessibilityLabel={favorite ? `إزالة ${label}` : `إضافة إلى ${label}`} accessibilityState={{ selected: favorite, disabled: loading }} disabled={loading} onPress={() => void toggle()} style={{ minWidth: sizes.touchTarget, minHeight: sizes.touchTarget, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: favorite ? colors.brand : colors.border, backgroundColor: favorite ? colors.brandSoft : colors.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: favorite ? colors.brand : colors.ink, ...typography.captionStrong }}>{loading ? '…' : favorite ? '♥ محفوظ' : '♡ حفظ'}</Text></Pressable>;
}
