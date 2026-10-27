import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { PageShell, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

type Destination = { title: string; description: string; path: string };
type DestinationGroup = { title: string; subtitle: string; items: Destination[] };

const groups: DestinationGroup[] = [
  { title: 'الإعلانات والبحث', subtitle: 'اعثر على ما تبحث عنه بسرعة', items: [
    { title: 'كل الإعلانات', description: 'تصفح أحدث الإعلانات المنشورة في السوق', path: '/' },
    { title: 'البحث المتقدم', description: 'ابحث بالاسم والسعر والمدينة والتصنيف', path: '/search' },
    { title: 'تصنيفات السوق', description: 'انتقل مباشرة إلى نوع الإعلان المناسب', path: '/categories' },
    { title: 'طلبات السوق', description: 'اعرف ما يبحث عنه الآخرون وقدّم عرضًا مناسبًا', path: '/requests' },
  ] },
  { title: 'المنتجات والمتاجر', subtitle: 'تسوّق من المتاجر المحلية', items: [
    { title: 'المنتجات', description: 'تصفح المنتجات وأسعارها', path: '/products' },
    { title: 'تصنيفات المنتجات', description: 'اعثر على المنتجات حسب نوعها', path: '/product-categories' },
    { title: 'المتاجر', description: 'اكتشف المتاجر المحلية وتابعها', path: '/stores' },
    { title: 'العروض المروجة', description: 'شاهد المنتجات والعروض المميزة', path: '/promoted' },
  ] },
  { title: 'الخدمات', subtitle: 'اعثر على خدمة أو مقدم خدمة', items: [
    { title: 'الخدمات المتاحة', description: 'تصفح الخدمات حسب احتياجك', path: '/services' },
    { title: 'مقدمو الخدمات', description: 'ابحث عن مقدم خدمة حسب المدينة', path: '/service-providers' },
  ] },
  { title: 'المجتمع والاكتشاف', subtitle: 'تابع النشاط والمحتوى الجديد', items: [
    { title: 'القصص', description: 'شاهد القصص النشطة من المستخدمين والمتاجر', path: '/stories' },
    { title: 'الرائج الآن', description: 'اكتشف المحتوى المتداول في السوق', path: '/trending' },
    { title: 'أفضل البائعين', description: 'تعرّف على البائعين الأعلى ترتيبًا', path: '/sellers-ranking' },
    { title: 'مقترحات لك', description: 'محتوى مقترح حسب الاهتمامات عند توفرها', path: '/suggestions' },
  ] },
];

export default function ExploreScreen() {
  return (
    <PageShell title="استكشف السوق">
      <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>رتّبنا الصفحات حسب ما تريد فعله حتى تصل إلى القسم المطلوب بخطوات أقل.</Text>
      {groups.map((group) => (
        <View key={group.title} style={{ gap: 10 }}>
          <View style={{ gap: 3 }}>
            <Text style={{ textAlign: 'right', fontSize: 18, fontWeight: '900', color: colors.ink }}>{group.title}</Text>
            <Text style={{ textAlign: 'right', fontSize: 12, color: colors.muted }}>{group.subtitle}</Text>
          </View>
          {group.items.map((item) => (
            <Pressable key={item.path} accessibilityRole="button" onPress={() => router.push(item.path as never)}>
              <SectionCard>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontSize: 19, fontWeight: '900' }}>›</Text></View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ textAlign: 'right', fontSize: 15, fontWeight: '900', color: colors.ink }}>{item.title}</Text>
                    <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 20, fontSize: 12 }}>{item.description}</Text>
                  </View>
                </View>
              </SectionCard>
            </Pressable>
          ))}
        </View>
      ))}
    </PageShell>
  );
}
