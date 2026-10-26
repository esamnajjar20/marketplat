import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { Notice, PageShell, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';
const destinations = [
  { title: 'إضافة إعلان', description: 'انشر إعلانًا جديدًا في السوق', path: '/ad-editor' },
  { title: 'إضافة منتج', description: 'أضف منتجًا إلى متجرك', path: '/product-editor' },
  { title: 'إضافة خدمة', description: 'أنشئ قائمة خدمة جديدة', path: '/service-editor' },
  { title: 'إنشاء طلب', description: 'اطلب خدمة أو منتجًا أو تأجيرًا', path: '/request-create' },
  { title: 'إنشاء متجر أو تعديل بياناته', description: 'إدارة بيانات المتجر والشعار والغلاف', path: '/my-store' },
  { title: 'إنشاء ملف مقدم خدمة', description: 'أنشئ ملف نشاطك وأدر خدماتك', path: '/service-provider-profile' },
];
export default function AddScreen() { const { user } = useAuth(); return <PageShell title="إضافة جديد">{!user ? <Notice>سجّل الدخول أولًا حتى تتمكن من الإضافة. ستتمكن بعد تسجيل الدخول من متابعة النموذج المناسب.</Notice> : null}{destinations.map(item => <Pressable key={item.path} onPress={() => router.push((!user ? '/login' : item.path) as never)}><SectionCard><Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>{item.title}</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 20 }}>{item.description}</Text><Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>فتح النموذج ←</Text></SectionCard></Pressable>)}</PageShell>; }
