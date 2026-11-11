import { View } from 'react-native';
import type { Href } from 'expo-router';
import { AppIcon, type GlyphName } from '@/components/Icons';
import { ListRow, SectionHeader } from '@/components/ui';
import { pushOnce } from '@/lib/navigation';
import { spacing } from '@/theme/tokens';

type LinkItem = { label: string; description: string; href: Href; icon: GlyphName };

const LINKS: LinkItem[] = [
  { label: 'الأمان', description: 'كلمة المرور وحماية الحساب', href: '/security', icon: 'privacy' },
  { label: 'الجلسات', description: 'الأجهزة المسجّلة الدخول', href: '/sessions', icon: 'account' },
  { label: 'المستخدمون المحظورون', description: 'إدارة قائمة الحظر', href: '/blocked-users', icon: 'account' },
  { label: 'إدارة المتجر', description: 'متجرك ومنتجاتك وطلباتك', href: '/my-store', icon: 'store' },
  { label: 'التخزين والعمل دون اتصال', description: 'البيانات المحفوظة على الجهاز', href: '/storage', icon: 'file' },
  { label: 'حذف الحساب', description: 'إجراء نهائي لا يمكن التراجع عنه', href: '/delete-account', icon: 'warning' },
];

/** روابط إدارة الحساب. حذف الحساب في الأخير عمدًا. */
export function AccountLinksSection() {
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="الحساب" />
      {LINKS.map((item) => (
        <ListRow
          key={item.label}
          title={item.label}
          description={item.description}
          glyph={<AppIcon name={item.icon} size={20} />}
          onPress={() => pushOnce(item.href)}
        />
      ))}
    </View>
  );
}
