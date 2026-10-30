import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchUserFollowList, type FollowListItem, type PaginationMeta } from '@/features/account/social.api';
import { EmptyState, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function FollowingScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<FollowListItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (nextPage = 1) => {
    if (!user?.id) { setError('سجّل الدخول لعرض الأشخاص الذين تتابعهم.'); setLoading(false); return; }
    setLoading(true); setError('');
    try { const result = await fetchUserFollowList(user.id, 'following', nextPage, 20); setItems(result.items); setMeta(result.meta); setPage(nextPage); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل قائمة المتابعة.'); }
    finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => { void load(1); }, [load]);
  return <PageShell title="الأشخاص الذين أتابعهم" right={<Pressable accessibilityRole="button" onPress={() => void load(page)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>تحديث</Text></Pressable>}>
    {loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل قائمة المتابعة…</Text></SectionCard> : null}
    {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load(page)} /></SectionCard> : null}
    {!loading && !error && items.length === 0 ? <EmptyState title="لا توجد حسابات تتابعها" description="عند متابعة حسابات من المنصة ستظهر هنا." /> : null}
    {items.map((entry) => { const target = entry.target; return <Pressable key={entry.id} accessibilityRole="button" onPress={() => target?.id && router.push({ pathname: '/profile/[id]', params: { id: target.id } })} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, minHeight: 76 }}>
      {target?.avatarUrl ? <Image source={{ uri: target.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border }} /> : <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft }}><Text style={{ color: colors.brand, fontWeight: '900', fontSize: 18 }}>{(target?.name || '?').slice(0, 1)}</Text></View>}
      <View style={{ flex: 1, gap: 3 }}><Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '800', fontSize: 14 }}>{target?.name || 'حساب مستخدم'}</Text><Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>{target?.city || 'الموقع غير محدد'}</Text></View>
      <Text style={{ color: colors.brand, fontSize: 20 }}>‹</Text>
    </Pressable>; })}
    {!loading && !error && (meta?.totalPages ?? 1) > 1 ? <View style={{ flexDirection: 'row-reverse', gap: spacing.sm }}><PrimaryButton label="السابق" variant="secondary" disabled={page <= 1} onPress={() => void load(page - 1)} /><PrimaryButton label="التالي" variant="secondary" disabled={page >= (meta?.totalPages ?? 1)} onPress={() => void load(page + 1)} /></View> : null}
    <Notice tone="muted">هذه القائمة تخص الحسابات الشخصية التي تتابعها. المتاجر التي تتابعها تظهر في صفحة «المتاجر التي أتابعها».</Notice>
  </PageShell>;
}
