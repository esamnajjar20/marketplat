import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyReports, type MyReport } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';
const labels: Record<string, string> = { AD: 'إعلان', USER: 'مستخدم', STORE: 'متجر', PRODUCT: 'منتج', SERVICE_LISTING: 'خدمة', SCAM: 'احتيال', FAKE: 'محتوى مزيف', OFFENSIVE: 'محتوى مسيء', SPAM: 'محتوى مزعج', PENDING: 'قيد المراجعة', REVIEWED: 'تمت المراجعة', RESOLVED: 'تمت المعالجة', DISMISSED: 'أُغلق البلاغ' };
export default function MyReportsScreen() {
  const { accessToken } = useAuth(); const [items, setItems] = useState<MyReport[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!accessToken) { setLoading(false); return; } setLoading(true); setError(''); try { setItems((await fetchMyReports(accessToken)).items); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل البلاغات.'); } finally { setLoading(false); } }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  return <PageShell title="بلاغاتي">{!accessToken ? <><Notice>سجّل الدخول لعرض البلاغات التي أرسلتها.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : <>{loading ? <ActivityIndicator color={colors.brand} /> : null}{error ? <Notice>{error}</Notice> : null}{items.map(item => <SectionCard key={item.id}><Text style={{ textAlign: 'right', fontWeight: '900', color: colors.ink }}>{labels[item.targetType || ''] || item.targetType || 'بلاغ'} · {labels[item.reason || ''] || item.reason || 'سبب غير محدد'}</Text><Text style={{ textAlign: 'right', color: colors.muted }}>الحالة: {labels[item.status || ''] || item.status || 'غير معروفة'}</Text>{item.createdAt ? <Text style={{ textAlign: 'right', color: colors.muted }}>التاريخ: {new Date(item.createdAt).toLocaleDateString('ar')}</Text> : null}{item.notes ? <Text style={{ textAlign: 'right', color: colors.ink }}>{item.notes}</Text> : null}</SectionCard>)}{!loading && !error && !items.length ? <Notice tone="muted">لم ترسل أي بلاغ حتى الآن.</Notice> : null}<PrimaryButton label="تحديث" variant="secondary" onPress={() => void load()} /></>}</PageShell>;
}
