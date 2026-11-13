/**
 * بديل PageShell للصفحات التي تعرض قائمة قد تطول: نفس الرأس والمسافات،
 * لكن الصفوف افتراضية (FlashList) بدل `.map` داخل ScrollView الذي يرسم كل شيء دفعة واحدة.
 */
import type { ReactElement, ReactNode } from 'react';
import { View, type RefreshControlProps } from 'react-native';
import { AppHeader } from './AppHeader';
import { ScreenFrame } from './ScreenFrame';
import { AppFlashList } from './AppFlashList';
import { ListGapXl } from './ListSeparator';
import { sizes, spacing } from '@/theme/tokens';

const contentStyle = {
  padding: spacing.lg,
  paddingBottom: spacing.x5l + sizes.bottomNavHeight / 2,
} as const;

export function PageList<T>({
  title,
  right,
  refreshControl,
  data,
  keyExtractor,
  renderItem,
  header,
  footer,
  extraData,
}: {
  title: string;
  right?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  data: ReadonlyArray<T>;
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  /** محتوى فوق الصفوف (ملاحظات، حالات تحميل/خطأ/فراغ). */
  header?: ReactNode;
  footer?: ReactNode;
  extraData?: unknown;
}) {
  return (
    <ScreenFrame keyboardAvoiding>
      <AppHeader title={title} right={right} />
      <AppFlashList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={extraData}
        refreshControl={refreshControl}
        contentContainerStyle={contentStyle}
        ItemSeparatorComponent={ListGapXl}
        ListHeaderComponent={header ? <View style={{ gap: spacing.xl, marginBottom: spacing.xl }}>{header}</View> : undefined}
        ListFooterComponent={footer ? <View style={{ gap: spacing.xl, marginTop: spacing.xl }}>{footer}</View> : undefined}
        showsVerticalScrollIndicator={false}
      />
    </ScreenFrame>
  );
}
