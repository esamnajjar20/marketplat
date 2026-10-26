import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { PageShell, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';
const destinations = [
  { title: 'الإعلانات', description: 'اكتشف أحدث الإعلانات من المستخدمين', path: '/' },
  { title: 'المنتجات', description: 'تصفح المنتجات والأسعار في المتاجر', path: '/products' },
  { title: 'تصنيفات المنتجات', description: 'اعثر على المنتجات حسب التصنيف', path: '/product-categories' },
  { title: 'العروض المروجة', description: 'منتجات مرتبطة بعروض ترويجية', path: '/promoted' },
  { title: 'المتاجر', description: 'اكتشف المتاجر المحلية وتابعها', path: '/stores' },
  { title: 'الخدمات', description: 'تصفح الخدمات المتاحة', path: '/services' },
  { title: 'مقدمو الخدمات', description: 'اعثر على مقدم خدمة حسب المدينة', path: '/service-providers' },
  { title: 'الطلبات المفتوحة', description: 'استكشف الطلبات المتاحة وقدم عرضًا مناسبًا', path: '/requests' },
];
export default function ExploreScreen() { return <PageShell title="استكشف MarketPlat"><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>اختر ما تريد استكشافه. النتائج تُحمّل من الخادم، وقد تتطلب بعض الوظائف تسجيل الدخول.</Text>{destinations.map(item => <Pressable key={item.path} onPress={() => router.push(item.path as never)}><SectionCard><Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>{item.title}</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 20 }}>{item.description}</Text><Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>استكشاف ←</Text></SectionCard></Pressable>)}</PageShell>; }
