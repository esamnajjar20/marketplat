import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { FlatList, RefreshControl, View } from 'react-native';
import { ListEmpty, ListStaleError, PaginatedFooter } from '@/components/ui';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyReports, type MyReport } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
import { marketListPerf } from '@/lib/listPerformance';
import { usePaginatedList } from '@/hooks/usePaginatedList';

const PAGE_SIZE = 20;
const labels: Record<string, string> = {
  AD: 'إعلان', USER: 'مستخدم', STORE: 'متجر', PRODUCT: 'منتج', SERVICE_LISTING: 'خدمة',
  SCAM: 'احتيال', FAKE: 'محتوى مزيف', OFFENSIVE: 'محتوى مسيء', SPAM: 'محتوى مزعج',
  PENDING: 'قيد المراجعة', REVIEWED: 'تمت المراجعة', RESOLVED: 'تمت المعالجة', DISMISSED: 'أُغلق البلاغ',
};

export default function MyReportsScreen() {
  const { colors } = useAppTheme();

  const { user, getAccessToken } = useAuth();
  const list = usePaginatedList<MyReport>({
    key: `my-reports:${user?.id ?? 'guest'}`,
    pageSize: PAGE_SIZE,
    enabled: Boolean(user),
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      return fetchMyReports(token, page, PAGE_SIZE, signal);
    },
    getItemKey: (item) => item.id,
  });

  return (
    <PageShell title="بلاغاتي" scroll={false}>
      {!user ? (
        <View style={{ gap: spacing.md }}>
          <Notice>سجّل الدخول لعرض البلاغات التي أرسلتها.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        </View>
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
              <ListStaleError list={list} />
            </View>
          }
          ListEmptyComponent={<ListEmpty list={list} loadingMessage="جاري تحميل بلاغاتك…" errorTitle="تعذر تحميل البلاغات" emptyTitle="لم ترسل أي بلاغ حتى الآن" />}
          renderItem={({ item }) => (
            <SectionCard>
              <Text style={{ textAlign: 'right', fontWeight: fontWeights.bold, fontSize: fontSizes[15], lineHeight: 22, color: colors.ink }}>
                {labels[item.targetType || ''] || item.targetType || 'بلاغ'} · {labels[item.reason || ''] || item.reason || 'سبب غير محدد'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[13], lineHeight: 20 }}>
                الحالة: {labels[item.status || ''] || item.status || 'غير معروفة'}
              </Text>
              {item.createdAt ? <Text tone="muted">التاريخ: {formatSafeDate(item.createdAt, 'date')}</Text> : null}
              {item.notes ? <Text style={{ textAlign: 'right', color: colors.ink, lineHeight: 22 }}>{item.notes}</Text> : null}
            </SectionCard>
          )}
          ListFooterComponent={
            <PaginatedFooter list={list} />
          }
          onEndReached={() => { void list.loadMore(); }}
          onEndReachedThreshold={0.4}
        />
      )}
    </PageShell>
  );
}
