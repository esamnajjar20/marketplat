import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AppIcon } from '@/components/Icons';
import { ListRow, SectionHeader } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { getConfiguredWebUrl } from '@/lib/web-links';
import { pushOnce } from '@/lib/navigation';
import { spacing } from '@/theme/tokens';

/** صفحات المنصة العامة (سياسة الخصوصية، الشروط، التواصل، التعريف) تُفتح من الويب نفسه لتبقى نسخة واحدة. */
const INFO_PAGES = [
  { title: 'سياسة الخصوصية', description: 'كيف نجمع بياناتك ونحميها', path: '/privacy', glyph: 'privacy' },
  { title: 'الشروط والأحكام', description: 'شروط استخدام المنصة', path: '/terms', glyph: 'info' },
  { title: 'اتصل بنا', description: 'تواصل مع فريق الدعم', path: '/contact', glyph: 'messages' },
  { title: 'عن المنصة', description: 'تعرّف على سوق غزة', path: '/about', glyph: 'info' },
] as const;

function openInfoPage(path: string) {
  void WebBrowser.openBrowserAsync(getConfiguredWebUrl(path)).catch(() => {
    showToast('تعذر فتح الصفحة', 'تحقق من الاتصال وحاول مرة أخرى.', 'error');
  });
}

/** المساعدة والدعم. */
export function HelpSection() {
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="المساعدة" />
      <ListRow
        title="العمليات دون اتصال"
        description="ما ينتظر المزامنة عند عودة الإنترنت"
        glyph={<AppIcon name="refresh" size={20} />}
        onPress={() => pushOnce('/offline-queue')}
      />
      <ListRow
        title="بلاغاتي"
        description="متابعة البلاغات التي أرسلتها"
        glyph={<AppIcon name="help" size={20} />}
        onPress={() => pushOnce('/my-reports')}
      />
      <SectionHeader title="معلومات المنصة" />
      {INFO_PAGES.map((page) => (
        <ListRow
          key={page.path}
          title={page.title}
          description={page.description}
          glyph={<AppIcon name={page.glyph} size={20} />}
          onPress={() => openInfoPage(page.path)}
        />
      ))}
    </View>
  );
}
