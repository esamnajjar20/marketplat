import { RefreshControl, type RefreshControlProps } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * سحب-للتحديث الموحّد: لون المؤشر من ثيم التطبيق على iOS (`tintColor`) وAndroid (`colors`)،
 * فلا تحتاج الشاشة إلى تمرير ألوان يدويًا. استخدمه بدل `RefreshControl` المباشر.
 */
export function BrandRefreshControl(props: RefreshControlProps) {
  const { colors } = useAppTheme();
  return <RefreshControl tintColor={colors.brand} colors={[colors.brand]} {...props} />;
}
