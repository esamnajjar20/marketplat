import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { PageShell, Notice, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { useAuth } from '@/features/auth/AuthContext';
import { clearPublicCache, getPublicCacheStats, type PublicCacheStats } from '@/storage/public-cache';
import { getAdDraftStorageSummary, type AdDraftStorageSummary } from '@/storage/ad-draft-store';
import { countUnownedOutboxMutations, listAllOutboxMutations } from '@/storage/mutation-outbox';
import { listPendingFavoriteStates } from '@/features/ads/favorites.store';
import { colors } from '@/theme/tokens';

type QueueStats = { pending: number; blockedLegacy: number; pendingFavorites: number };
function formatBytes(bytesValue: number): string {
  const bytes = Math.max(0, bytesValue); // UTF-8 serialized payload size; excludes SQLite/filesystem overhead.
  if (bytes < 1024) return `${bytes} بايت تقريبًا`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت تقريبًا`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميغابايت تقريبًا`;
}
function formatDate(value: number | null): string {
  if (!value) return 'لا توجد بيانات';
  try { return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return new Date(value).toLocaleString(); }
}
function StatRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <View style={styles.statRow}><View style={styles.statCopy}><Text style={styles.statLabel}>{label}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</View><Text style={styles.statValue}>{value}</Text></View>;
}
export default function StorageScreen() {
  const { user } = useAuth();
  const [cache, setCache] = useState<PublicCacheStats>({ entries: 0, sizeBytes: 0, newestSavedAt: null });
  const [drafts, setDrafts] = useState<AdDraftStorageSummary>({ drafts: 0, editDrafts: 0, sizeBytes: 0, newestUpdatedAt: null });
  const [queue, setQueue] = useState<QueueStats>({ pending: 0, blockedLegacy: 0, pendingFavorites: 0 });
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const [cacheStats, draftStats, outbox, legacy, favoriteOps] = await Promise.all([
        getPublicCacheStats(),
        user?.id ? getAdDraftStorageSummary(user.id) : Promise.resolve({ drafts: 0, editDrafts: 0, sizeBytes: 0, newestUpdatedAt: null }),
        user?.id ? listAllOutboxMutations(user.id) : Promise.resolve([]),
        countUnownedOutboxMutations(),
        user?.id ? listPendingFavoriteStates(user.id) : Promise.resolve([]),
      ]);
      setCache(cacheStats); setDrafts(draftStats);
      setQueue({ pending: outbox.length, blockedLegacy: legacy, pendingFavorites: favoriteOps.length });
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر قراءة بيانات التخزين المحلي.'); return false; }
    finally { setLoading(false); }
  }, [user?.id]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const clearCache = () => Alert.alert('مسح ذاكرة التخزين المؤقت', 'سيتم حذف البيانات العامة المؤقتة فقط. لن تُحذف المسودات أو العمليات غير المتصلة أو بيانات تسجيل الدخول.', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'مسح الذاكرة المؤقتة', style: 'destructive', onPress: () => {
      setClearing(true);
      void clearPublicCache().then(async () => {
        const refreshed = await refresh();
        if (!refreshed) throw new Error('تم تنفيذ طلب المسح لكن تعذر التحقق من النتيجة. أعد تحديث معلومات التخزين.');
        if (cache.entries !== 0) throw new Error('لم تصبح الذاكرة المؤقتة فارغة بعد المسح. أعد المحاولة.');
        setMessage('تم مسح الذاكرة المؤقتة بنجاح.');
      }).catch((e) => setError(e instanceof Error ? e.message : 'تعذر مسح الذاكرة المؤقتة.')).finally(() => setClearing(false));
    } },
  ]);
  return <PageShell title="التخزين والبيانات">
    <Text style={styles.intro}>إدارة البيانات المحلية في هذا الجهاز. الحجم هو عدد بايتات UTF-8 لنصوص JSON المخزنة، ويستثني فهارس SQLite ومساحة قاعدة البيانات الإضافية؛ لذلك هو تقدير لحجم المحتوى لا لحجم الملفات على القرص.</Text>
    {error ? <Notice>{error}</Notice> : null}{message ? <Notice tone="success">{message}</Notice> : null}
    {loading ? <SectionCard><ActivityIndicator color={colors.brand}/><Text style={styles.loading}>جارٍ قراءة التخزين…</Text></SectionCard> : error ? <SectionCard><Text style={styles.loading}>تعذر قراءة الإحصاءات؛ لم نعرض أرقامًا افتراضية حتى لا تبدو كأن التخزين فارغ.</Text><PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void refresh()} /></SectionCard> : <>
      <SectionCard>
        <Text style={styles.sectionTitle}>الذاكرة المؤقتة العامة</Text>
        <StatRow label="عناصر مخزنة" value={String(cache.entries)} />
        <StatRow label="الحجم التقديري" value={formatBytes(cache.sizeBytes)} />
        <StatRow label="آخر تحديث" value={formatDate(cache.newestSavedAt)} />
        <PrimaryButton label="مسح الذاكرة المؤقتة" variant="secondary" busy={clearing} onPress={clearCache} />
      </SectionCard>
      <SectionCard>
        <Text style={styles.sectionTitle}>مسودات الإعلانات</Text>
        <StatRow label="مسودات إنشاء" value={String(drafts.drafts)} />
        <StatRow label="مسودات تعديل" value={String(drafts.editDrafts)} />
        <StatRow label="الحجم التقديري" value={formatBytes(drafts.sizeBytes)} />
        <StatRow label="آخر حفظ" value={formatDate(drafts.newestUpdatedAt)} />
        <Notice tone="muted">المسودات محفوظة محليًا للحفاظ على عملك. لا تُحذف عند مسح الذاكرة المؤقتة.</Notice>
      </SectionCard>
      <SectionCard>
        <Text style={styles.sectionTitle}>عمليات تنتظر المزامنة</Text>
        <StatRow label="عمليات الحساب الحالي" value={String(queue.pending)} detail="قد تتضمن إنشاء إعلان أو تعديله أو حذفه." />
        <StatRow label="تغييرات المفضلة المعلقة" value={String(queue.pendingFavorites)} />
        <StatRow label="عمليات قديمة بلا حساب معروف" value={String(queue.blockedLegacy)} detail="لا تُرسل تلقائيًا لحماية بيانات الحسابات." />
        <PrimaryButton label="إدارة العمليات دون اتصال" onPress={() => router.push('/offline-queue')} />
      </SectionCard>
      <SectionCard>
        <Text style={styles.sectionTitle}>إدارة البيانات</Text>
        <PrimaryButton label="عمليات البحث المحفوظة" variant="secondary" onPress={() => router.push('/saved-searches')} />
        <PrimaryButton label="الإعدادات" variant="secondary" onPress={() => router.push('/settings')} />
      </SectionCard>
    </>}
    <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.refresh}><Text style={styles.refreshText}>تحديث معلومات التخزين</Text></Pressable>
  </PageShell>;
}
const styles = StyleSheet.create({ intro: { textAlign: 'right', color: colors.muted, fontSize: 14, lineHeight: 23 }, sectionTitle: { color: colors.ink, textAlign: 'right', fontWeight: '900', fontSize: 16 }, statRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, statCopy: { flex: 1, gap: 3 }, statLabel: { textAlign: 'right', color: colors.ink, fontSize: 14, fontWeight: '700' }, statValue: { color: colors.brand, fontSize: 13, fontWeight: '900', maxWidth: '48%', textAlign: 'left' }, detail: { textAlign: 'right', color: colors.muted, fontSize: 12, lineHeight: 19 }, loading: { textAlign: 'center', color: colors.muted }, refresh: { padding: 15, alignItems: 'center' }, refreshText: { color: colors.brand, fontWeight: '800' } });
