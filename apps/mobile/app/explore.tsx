import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { toAppHref } from '@/lib/typed-navigation';
import { ListRow, PageShell, SectionHeader } from '@/components/MobileUI';
import { spacing, typography } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

type Destination = { title: string; description: string; path: string };
type DestinationGroup = { title: string; subtitle: string; items: Destination[] };

/**
 * Keep mobile discovery aligned with frontend/lib/navigation.ts BROWSE_LINKS.
 * The web's home destination is intentionally excluded because it has its own
 * bottom-tab destination. Do not add account/workspace destinations here.
 */
const groups: DestinationGroup[] = [
  {
    title: 'استكشف السوق',
    subtitle: 'الوجهات الثماني نفسها الموجودة في قائمة تصفح الويب',
    items: [
      { title: 'البحث', description: 'ابحث في الإعلانات والمنتجات والخدمات والمتاجر', path: '/search' },
      { title: 'الإعلانات', description: 'تصفح الإعلانات المنشورة في السوق', path: '/ads' },
      { title: 'المنتجات', description: 'تصفح المنتجات المعروضة للبيع', path: '/products' },
      { title: 'الخدمات', description: 'اكتشف الخدمات المتاحة', path: '/services' },
      { title: 'سوق الطلبات', description: 'اعرف ما يبحث عنه الآخرون وقدّم عرضك', path: '/requests' },
      { title: 'المتاجر', description: 'اكتشف المتاجر المحلية وتابعها', path: '/stores' },
      { title: 'مقدمو الخدمة', description: 'اعثر على مقدم الخدمة المناسب', path: '/service-providers' },
      { title: 'أفضل البائعين', description: 'تعرّف على البائعين الأعلى ترتيباً', path: '/sellers-ranking' },
    ],
  },
];

export default function ExploreScreen() {
  const { colors } = useAppTheme();

  return (
    <PageShell title="استكشف السوق" scroll={false}>
      <FlatList
        data={groups}
        keyExtractor={(group) => group.title}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.xl }}
        ListHeaderComponent={
          <Text style={{ textAlign: 'right', ...typography.body, color: colors.muted, marginBottom: spacing.md }}>
            تصفح أقسام السوق الثمانية كما تظهر على الويب، مع واجهة ملائمة للهاتف.
          </Text>
        }
        renderItem={({ item: group }) => (
          <View style={{ gap: spacing.md }}>
            <SectionHeader title={group.title} subtitle={group.subtitle} />
            {group.items.map((item) => (
              <ListRow
                key={item.path}
                title={item.title}
                description={item.description}
                onPress={() => router.push(toAppHref(item.path))}
              />
            ))}
          </View>
        )}
      />
    </PageShell>
  );
}
