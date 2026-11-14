import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { RefreshControl, View } from 'react-native';
import { ListEmpty, ListStaleError, PaginatedFooter, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyReports, type MyReport } from '@/features/account/social.api';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
import { domainLabel } from '@/lib/status-labels';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

const PAGE_SIZE = 20;
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
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </View>
      ) : (
        <AppFlashList ItemSeparatorComponent={ListGapMd}
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.x4l }}
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
                {domainLabel('reportTarget', item.targetType, item.targetType || 'بلاغ')} · {domainLabel('reportReason', item.reason, item.reason || 'سبب غير محدد')}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[13], lineHeight: 20 }}>
                الحالة: {domainLabel('report', item.status, item.status || 'غير معروفة')}
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
