import { AppText as Text } from '@/components/ui/AppText';
import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyStore } from '@/features/commerce/commerce.api';
import { fetchMyActiveStoreMemberships } from '@/features/commerce/store-management.api';
import { fetchMyServiceProvider } from '@/features/services/providers.api';
import { ListRow, Notice, PageShell, SectionHeader } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';

const groups = [
  {
    title: 'نشر في السوق',
    subtitle: 'محتوى يراه المشترون والزوار',
    items: [
      { title: 'إضافة إعلان', description: 'انشر إعلانًا جديدًا في السوق', path: '/ad-editor' },
      { title: 'إضافة منتج', description: 'أضف منتجًا إلى متجر تملك صلاحية النشر فيه', path: '/product-editor' },
      { title: 'إضافة خدمة', description: 'أنشئ قائمة خدمة من خلال ملف مقدم الخدمة', path: '/service-editor' },
      { title: 'إنشاء طلب', description: 'اطلب خدمة أو منتجًا أو تأجيرًا', path: '/request-create' },
    ],
  },
  {
    title: 'إدارة النشاط',
    subtitle: 'أدوات البائع ومقدم الخدمة',
    items: [
      { title: 'تسجيل عملية بيع', description: 'سجّل بيعًا يدويًا واحفظه للمزامنة عند عودة الإنترنت', path: '/sale-create' },
      { title: 'إنشاء متجر أو تعديل بياناته', description: 'إدارة بيانات المتجر والشعار والغلاف', path: '/my-store' },
      { title: 'إنشاء ملف مقدم خدمة', description: 'أنشئ ملف نشاطك وأدر خدماتك', path: '/service-provider-profile' },
    ],
  },
];

export default function AddScreen() {
  const { user, accessToken } = useAuth();
  const [checkingPath, setCheckingPath] = useState('');
  const [error, setError] = useState('');

  const open = async (path: string) => {
    if (!user || !accessToken) { router.push('/login'); return; }
    if (checkingPath) return;
    setError('');
    if (path !== '/product-editor' && path !== '/service-editor') { router.push(path as never); return; }
    setCheckingPath(path);
    try {
      if (path === '/product-editor') {
        const ownedStore = await fetchMyStore(accessToken);
        if (ownedStore) { router.push('/product-editor'); return; }
        const memberships = await fetchMyActiveStoreMemberships(accessToken);
        const canPublish = memberships.some((membership) => membership.role === 'MANAGER' || membership.role === 'EDITOR');
        router.push(canPublish ? '/product-editor' : '/my-store');
        return;
      }
      const provider = await fetchMyServiceProvider(accessToken);
      router.push(provider ? '/service-editor' : '/service-provider-profile');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحقق من صلاحية الإضافة. حاول مجددًا.');
    } finally {
      setCheckingPath('');
    }
  };

  return (
    <PageShell title="إضافة جديد">
      {!user ? <Notice>سجّل الدخول أولًا حتى تتمكن من الإضافة. ستتمكن بعد تسجيل الدخول من متابعة النموذج المناسب.</Notice> : user.emailVerified === false ? <Notice tone="warning">بريدك الإلكتروني غير مؤكد. أكّده قبل إنشاء نشاط تجاري أو رفع محتوى يتطلب التحقق. <Text onPress={() => router.push('/verify-email')} style={{ color: colors.brand, fontWeight: '800' }}>فتح التحقق</Text></Notice> : null}
      {checkingPath ? <Notice tone="muted">جارٍ التحقق من صلاحية النشر…</Notice> : null}
      {groups.map((group) => <View key={group.title} style={{ gap: spacing.md }}>
        <SectionHeader title={group.title} subtitle={group.subtitle} />
        {group.items.map((item) => <ListRow key={item.path} title={item.title} description={item.description} onPress={() => void open(item.path)} />)}
      </View>)}
      {error ? <Notice>{error}</Notice> : null}
    </PageShell>
  );
}
