import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { PageShell, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';
const destinations = [
  { title: 'الإعلانات', description: 'اكتشف أحدث الإعلانات من المستخدمين', path: '/' },
  { title: 'القصص', description: 'شاهد القصص النشطة أو انشر قصة تختفي بعد 24 ساعة وشارك رابطها', path: '/stories' },
  { title: 'تصنيفات السوق', description: 'تصفح التصنيفات العامة والإعلانات ضمن كل تصنيف', path: '/categories' },
  { title: 'البحث المتقدم', description: 'ابحث عبر الإعلانات والمنتجات والمتاجر والخدمات مع فلاتر السعر والتصنيف', path: '/search' },
  { title: 'مقترحات لك', description: 'محتوى مقترح حسب اهتماماتك ونشاطك عند تسجيل الدخول', path: '/suggestions' },
  { title: 'الرائج الآن', description: 'اكتشف محتوى متنوعًا من الإعلانات والمنتجات والخدمات', path: '/trending' },
  { title: 'أفضل البائعين', description: 'ترتيب البائعين حسب التقييم والثقة وسرعة الاستجابة', path: '/sellers-ranking' },
  { title: 'المنتجات', description: 'تصفح المنتجات والأسعار في المتاجر', path: '/products' },
  { title: 'تصنيفات المنتجات', description: 'اعثر على المنتجات حسب التصنيف', path: '/product-categories' },
  { title: 'العروض المروجة', description: 'منتجات مرتبطة بعروض ترويجية', path: '/promoted' },
  { title: 'المتاجر', description: 'اكتشف المتاجر المحلية وتابعها', path: '/stores' },
  { title: 'الخدمات', description: 'تصفح الخدمات المتاحة', path: '/services' },
  { title: 'مقدمو الخدمات', description: 'اعثر على مقدم خدمة حسب المدينة', path: '/service-providers' },
  { title: 'الطلبات المفتوحة', description: 'استكشف الطلبات المتاحة وقدم عرضًا مناسبًا', path: '/requests' },
];
export default function ExploreScreen() { return <PageShell title="استكشف MarketPlat"><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>اختر ما تريد استكشافه. النتائج تُحمّل من الخادم، وقد تتطلب بعض الوظائف تسجيل الدخول.</Text>{destinations.map(item => <Pressable key={item.path} accessibilityRole="button" onPress={() => router.push(item.path as never)} style={{ marginBottom: 2 }}><SectionCard><Text style={{ textAlign: 'right', fontSize: 17, fontWeight: '900', color: colors.ink, lineHeight: 25 }}>{item.title}</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 23, marginTop: 3 }}>{item.description}</Text><Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '900', paddingTop: 8, minHeight: 32 }}>استكشاف ←</Text></SectionCard></Pressable>)}</PageShell>; }
