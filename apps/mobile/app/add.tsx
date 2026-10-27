import { router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { ListRow, Notice, PageShell, SectionHeader } from '@/components/MobileUI';
import { spacing } from '@/theme/tokens';

const groups = [
  {
    title: 'نشر في السوق',
    subtitle: 'محتوى يراه المشترون والزوار',
    items: [
      { title: 'إضافة إعلان', description: 'انشر إعلانًا جديدًا في السوق', path: '/ad-editor' },
      { title: 'إضافة منتج', description: 'أضف منتجًا إلى متجرك', path: '/product-editor' },
      { title: 'إضافة خدمة', description: 'أنشئ قائمة خدمة جديدة', path: '/service-editor' },
      { title: 'إنشاء طلب', description: 'اطلب خدمة أو منتجًا أو تأجيرًا', path: '/request-create' },
    ],
  },
  {
    title: 'إدارة النشاط',
    subtitle: 'أدوات البائع ومقدم الخدمة',
    items: [
      {
        title: 'تسجيل عملية بيع',
        description: 'سجّل بيعًا يدويًا واحفظه للمزامنة عند عودة الإنترنت',
        path: '/sale-create',
      },
      {
        title: 'إنشاء متجر أو تعديل بياناته',
        description: 'إدارة بيانات المتجر والشعار والغلاف',
        path: '/my-store',
      },
      {
        title: 'إنشاء ملف مقدم خدمة',
        description: 'أنشئ ملف نشاطك وأدر خدماتك',
        path: '/service-provider-profile',
      },
    ],
  },
];

export default function AddScreen() {
  const { user } = useAuth();

  const open = (path: string) => {
    router.push((!user ? '/login' : path) as never);
  };

  return (
    <PageShell title="إضافة جديد">
      {!user ? (
        <Notice>
          سجّل الدخول أولًا حتى تتمكن من الإضافة. ستتمكن بعد تسجيل الدخول من متابعة النموذج المناسب.
        </Notice>
      ) : null}

      {groups.map((group) => (
        <View key={group.title} style={{ gap: spacing.md }}>
          <SectionHeader title={group.title} subtitle={group.subtitle} />
          {group.items.map((item) => (
            <ListRow
              key={item.path}
              title={item.title}
              description={item.description}
              onPress={() => open(item.path)}
            />
          ))}
        </View>
      ))}
    </PageShell>
  );
}
