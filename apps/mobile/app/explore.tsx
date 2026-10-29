import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ListRow, PageShell, SectionHeader } from '@/components/MobileUI';
import { colors, spacing, typography } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

type Destination = { title: string; description: string; path: string };
type DestinationGroup = { title: string; subtitle: string; items: Destination[] };

const groups: DestinationGroup[] = [
  {
    title: 'الإعلانات والطلبات',
    subtitle: 'ابدأ من هنا للتصفح أو البحث',
    items: [
      { title: 'كل الإعلانات', description: 'تصفح أحدث الإعلانات المنشورة في السوق', path: '/' },
      { title: 'البحث المتقدم', description: 'ابحث بالاسم والسعر والمدينة والتصنيف', path: '/search' },
      { title: 'تصنيفات السوق', description: 'انتقل مباشرة إلى نوع الإعلان المناسب', path: '/categories' },
      { title: 'طلبات السوق', description: 'اعرف ما يبحث عنه الآخرون وقدّم عرضًا مناسبًا', path: '/requests' },
    ],
  },
  {
    title: 'المنتجات والمتاجر',
    subtitle: 'تسوّق من المتاجر المحلية',
    items: [
      { title: 'المنتجات', description: 'تصفح المنتجات وأسعارها', path: '/products' },
      { title: 'تصنيفات المنتجات', description: 'اعثر على المنتجات حسب نوعها', path: '/product-categories' },
      { title: 'المتاجر', description: 'اكتشف المتاجر المحلية وتابعها', path: '/stores' },
      { title: 'العروض المروجة', description: 'شاهد المنتجات والعروض المميزة', path: '/promoted' },
    ],
  },
  {
    title: 'الخدمات',
    subtitle: 'اعثر على خدمة أو مقدم خدمة',
    items: [
      { title: 'الخدمات المتاحة', description: 'تصفح الخدمات حسب احتياجك', path: '/services' },
      { title: 'مقدمو الخدمات', description: 'ابحث عن مقدم خدمة حسب المدينة', path: '/service-providers' },
    ],
  },
  {
    title: 'المجتمع والاكتشاف',
    subtitle: 'تابع النشاط والمحتوى الجديد',
    items: [
      { title: 'القصص', description: 'شاهد القصص النشطة من المستخدمين والمتاجر', path: '/stories' },
      { title: 'الرائج الآن', description: 'اكتشف المحتوى المتداول في السوق', path: '/trending' },
      { title: 'أفضل البائعين', description: 'تعرّف على البائعين الأعلى ترتيبًا', path: '/sellers-ranking' },
      { title: 'مقترحات لك', description: 'محتوى مقترح حسب الاهتمامات عند توفرها', path: '/suggestions' },
    ],
  },
];

export default function ExploreScreen() {
  return (
    <PageShell title="استكشف السوق" scroll={false}>
      <FlatList
        data={groups}
        keyExtractor={(group) => group.title}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.xl }}
        ListHeaderComponent={
          <Text style={{ textAlign: 'right', ...typography.body, color: colors.muted, marginBottom: spacing.md }}>
            رتّبنا الصفحات حسب ما تريد فعله حتى تصل إلى القسم المطلوب بخطوات أقل.
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
                onPress={() => router.push(item.path as never)}
              />
            ))}
          </View>
        )}
      />
    </PageShell>
  );
}
