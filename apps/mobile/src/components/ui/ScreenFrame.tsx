import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { shouldHideBottomNavigation } from '@/lib/navigation-policy';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * الإطار الموحّد لكل شاشة (SafeArea + خلفية + تفادي لوحة المفاتيح).
 *
 * القاعدة الوحيدة للحواف: الحافة السفلية تُحترم فقط عندما يكون شريط التنقل السفلي
 * مخفيًا لهذا المسار (سياسة `navigation-policy`)؛ وإلا فإن الشريط نفسه يتكفّل
 * بالحافة السفلية. كانت كل شاشة تقرّر ذلك بنفسها فتظهر الأزرار السفلية تحت شريط
 * إيماءات النظام في شاشات المحررات والتفاصيل.
 *
 * - `PageShell` يبني عليه للصفحات القابلة للتمرير.
 * - الشاشات القائمة على FlatList (قوائم، بحث، محادثة) تستعمله مباشرة وتضع AppHeader بنفسها.
 */
export function ScreenFrame({
  children,
  keyboardAvoiding = false,
}: {
  children: ReactNode;
  /** يلفّ المحتوى بـ KeyboardAvoidingView (نماذج الإدخال). */
  keyboardAvoiding?: boolean;
}) {
  const { colors } = useAppTheme();
  const pathname = usePathname();
  const edges: Edge[] = shouldHideBottomNavigation(pathname) ? ['top', 'bottom'] : ['top'];

  const frame = (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={edges}>
      {children}
    </SafeAreaView>
  );

  if (!keyboardAvoiding) return frame;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {frame}
    </KeyboardAvoidingView>
  );
}
