import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchUserFollowList, type FollowListItem } from '@/features/account/social.api';
import { EmptyState, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, colors, radius, spacing, typography } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';

export default function FollowingScreen() {
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
    mapError: () => 'تعذر تحميل قائمة المتابعة. حاول مجددًا.',
  });

  return <PageShell title="الأشخاص الذين أتابعهم" right={<Pressable accessibilityRole="button" onPress={() => void list.refresh()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>تحديث</Text></Pressable>}>
    {!user?.id ? <SectionCard><Notice>سجّل الدخول لعرض الأشخاص الذين تتابعهم.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></SectionCard> : null}
    {list.loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل قائمة المتابعة…</Text></SectionCard> : null}
    {list.error ? <SectionCard><Notice>{list.error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void list.retry()} /></SectionCard> : null}
    {!list.loading && !list.error && user?.id && list.items.length === 0 ? <EmptyState title="لا توجد حسابات تتابعها" description="عند متابعة حسابات من المنصة ستظهر هنا." /> : null}
    {list.items.map((entry) => { const target = entry.target; return <Pressable key={entry.id} accessibilityRole="button" onPress={() => target?.id && router.push({ pathname: '/profile/[id]', params: { id: target.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, minHeight: 76 }}>
      {target?.avatarUrl ? <Image source={{ uri: target.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border }} /> : <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft }}><Text style={{ color: colors.brandOnSoft, fontWeight: '900', fontSize: fontSizes[18] }}>{(target?.name || '?').slice(0, 1)}</Text></View>}
      <View style={{ flex: 1, gap: 3 }}><Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '800', fontSize: fontSizes[14] }}>{target?.name || 'حساب مستخدم'}</Text><Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[12] }}>{target?.city || 'الموقع غير محدد'}</Text></View>
      <Text style={{ color: colors.brand, fontSize: fontSizes[20] }}>‹</Text>
    </Pressable>; })}
    {!list.loading && !list.error && list.items.length > 0 && list.totalPages > 1 ? <View style={{ flexDirection: 'row', gap: spacing.sm }}><PrimaryButton label="السابق" variant="secondary" disabled={list.page <= 1 || list.loading} onPress={() => void list.goToPage(list.page - 1)} /><PrimaryButton label="التالي" variant="secondary" disabled={!list.hasNextPage || list.loading} onPress={() => void list.goToPage(list.page + 1)} /></View> : null}
    <Notice tone="muted">هذه القائمة تخص الحسابات الشخصية التي تتابعها. المتاجر التي تتابعها تظهر في صفحة «المتاجر التي أتابعها».</Notice>
  </PageShell>;
}
