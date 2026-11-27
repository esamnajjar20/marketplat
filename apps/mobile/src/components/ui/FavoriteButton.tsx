import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pushOnce } from '@/lib/navigation';
import { useAuthSession } from '@/features/auth/AuthContext';
import { checkFavoriteEntity, setFavoriteEntityState, type FavoriteEntityType } from '@/features/ads/favorites.api';
import { radius, sizes, typography, spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { COPY } from '@/lib/copy';

type CheckStatus = 'loading' | 'ready' | 'error';

export function FavoriteButton({ entityType, entityId, label = 'المفضلة' }: {
  entityType: FavoriteEntityType;
  entityId: string;
  label?: string;
}) {
  const { accessToken, csrfToken } = useAuthSession();
  const { colors } = useAppTheme();
  const [favorite, setFavorite] = useState(false);
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('loading');
  const [saving, setSaving] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!accessToken || !entityId) {
      setFavorite(false);
      setCheckStatus('ready');
      return;
    }
    setCheckStatus('loading');
    try {
      const value = await checkFavoriteEntity(entityType, entityId, accessToken);
      if (sequence !== requestSequence.current) return;
      setFavorite(value);
      setCheckStatus('ready');
    } catch {
      if (sequence !== requestSequence.current) return;
      // Unknown is not the same as not favorited. Keep the action disabled
      // until the server confirms the current state.
      setCheckStatus('error');
    }
  }, [accessToken, entityId, entityType]);

  useEffect(() => {
    void refresh();
    return () => { requestSequence.current += 1; };
  }, [refresh]);

  const toggle = async () => {
    if (!accessToken) {
      pushOnce('/login');
      return;
    }
    if (checkStatus === 'error') {
      await refresh();
      return;
    }
    if (checkStatus !== 'ready' || saving || !entityId) return;

    setSaving(true);
    try {
      // Desired-state PUT is idempotent: retrying a lost acknowledgement
      // cannot accidentally invert the favorite state.
      const nextState = await setFavoriteEntityState(
        entityType,
        entityId,
        !favorite,
        accessToken,
        csrfToken,
      );
      setFavorite(nextState);
    } catch (error) {
      showToast('تعذر تحديث المفضلة', error instanceof Error ? error.message : COPY.tryAgain, 'error');
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || checkStatus === 'loading';
  const buttonLabel = checkStatus === 'loading'
    ? 'جارٍ التحقق…'
    : checkStatus === 'error'
      ? 'إعادة التحقق'
      : favorite
        ? `إزالة ${label} من المفضلة`
        : `إضافة ${label} إلى المفضلة`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={buttonLabel}
      accessibilityState={{ selected: favorite, disabled }}
      disabled={disabled}
      onPress={() => void toggle()}
      style={{
        minWidth: sizes.touchTarget,
        minHeight: sizes.touchTarget,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: favorite ? colors.brand : colors.border,
        backgroundColor: favorite ? colors.brandSoft : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <Text style={{ color: favorite ? colors.brandOnSoft : colors.ink, ...typography.captionStrong }}>
        {saving ? 'جارٍ الحفظ…' : checkStatus === 'loading' ? '…' : checkStatus === 'error' ? 'إعادة المحاولة' : favorite ? '♥ محفوظ' : '♡ حفظ'}
      </Text>
    </Pressable>
  );
}
