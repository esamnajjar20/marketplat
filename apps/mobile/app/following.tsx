import { useAppTheme } from '@/theme/ThemeProvider';
import { AppIcon } from '@/components/Icons';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchUserFollowList, type FollowListItem } from '@/features/account/social.api';
import { EmptyState, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { PageList } from '@/components/ui/PageList';
import { fontSizes, radius, spacing, typography, fontWeights } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';

const FollowingRow = memo(function FollowingRow({ entry, onOpen }: { entry: FollowListItem; onOpen: (userId: string) => void }) {
  const { colors } = useAppTheme();
  const target = entry.target;
  return <Pressable accessibilityRole="button" onPress={() => target?.id && onOpen(target.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, minHeight: 76 }}>
    {target?.avatarUrl ? <AppImage uri={target.avatarUrl} variant="list" style={{ width: 48, height: 48, borderRadius: radius.hero, backgroundColor: colors.border }} /> : <View style={{ width: 48, height: 48, borderRadius: radius.hero, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft }}><Text style={{ color: colors.brandOnSoft, fontWeight: fontWeights.bold, fontSize: fontSizes[18] }}>{(target?.name || '?').slice(0, 1)}</Text></View>}
    <View style={{ flex: 1, gap: spacing.xs }}><Text tone="ink" strong size={14}>{target?.name || 'حساب مستخدم'}</Text><Text tone="muted" size={12}>{target?.city || 'الموقع غير محدد'}</Text></View>
    <AppIcon name="forward" size={20} color={colors.brand} />
  </Pressable>;
});

const followingKey = (entry: FollowListItem) => entry.id;

export default function FollowingScreen() {
  const { colors } = useAppTheme();

  const { user } = useAuth();
  const fetchPage = useCallback(async (page: number, signal: AbortSignal) => {
    if (!user?.id) return { items: [], meta: { page: 1, totalPages: 1 } };
    const result = await fetchUserFollowList(user.id, 'following', page, 20, signal);
    return { items: result.items, meta: result.meta };
  }, [user?.id]);
  const list = usePaginatedList<FollowListItem>({
    key: `user-following:${user?.id ?? 'anonymous'}`,
    pageSize: 20,
    enabled: Boolean(user?.id),
    fetchPage,
    getItemKey: (item) => item.id,
    mapError: () => 'تعذر تحميل قائمة المتابعة. حاول مرة أخرى.',
  });

  const openProfile = useCallback((userId: string) => router.push({ pathname: '/profile/[id]', params: { id: userId } }), []);
  const renderItem = useCallback(({ item }: { item: FollowListItem }) => <FollowingRow entry={item} onOpen={openProfile} />, [openProfile]);

  const header = <>
    {!user?.id ? <SectionCard><Notice>سجّل الدخول لعرض الأشخاص الذين تتابعهم.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></SectionCard> : null}
    {list.loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل قائمة المتابعة…</Text></SectionCard> : null}
    {list.error ? <SectionCard><Notice>{list.error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void list.retry()} /></SectionCard> : null}
    {!list.loading && !list.error && user?.id && list.items.length === 0 ? <EmptyState title="لا توجد حسابات تتابعها" description="عند متابعة حسابات من المنصة ستظهر هنا." /> : null}
  </>;
  const footer = <>
    {!list.loading && !list.error && list.items.length > 0 && list.totalPages > 1 ? <View style={{ flexDirection: 'row', gap: spacing.sm }}><PrimaryButton label="السابق" variant="secondary" disabled={list.page <= 1 || list.loading} onPress={() => void list.goToPage(list.page - 1)} /><PrimaryButton label="التالي" variant="secondary" disabled={!list.hasNextPage || list.loading} onPress={() => void list.goToPage(list.page + 1)} /></View> : null}
    <Notice tone="muted">هذه القائمة تخص الحسابات الشخصية التي تتابعها. المتاجر التي تتابعها تظهر في صفحة «المتاجر التي أتابعها».</Notice>
  </>;

  return <PageList
    title="الأشخاص الذين أتابعهم"
    right={<Pressable accessibilityRole="button" onPress={() => void list.refresh()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>تحديث</Text></Pressable>}
    data={list.items}
    keyExtractor={followingKey}
    renderItem={renderItem}
    header={header}
    footer={footer}
  />;
}
