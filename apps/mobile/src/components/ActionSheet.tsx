import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { radius, spacing, fontSizes } from '@/theme/tokens';

export type ActionSheetOption = {
  key: string;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
};

type Props = {
  visible: boolean;
  title: string;
  description?: string;
  options: ActionSheetOption[];
  onClose: () => void;
};

/** Non-destructive choice sheet; use confirmAlert (src/lib/confirm.ts) for consequential confirmations. */
export function ActionSheet({ visible, title, description, options, onClose }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق القائمة" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {options.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                option.onPress();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <Text style={[styles.optionText, option.tone === 'danger' && styles.dangerText]}>{option.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.option, styles.cancel]}>
            <Text style={styles.cancelText}>إغلاق</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.modalBackdrop },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { width: '100%', maxWidth: 560, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.sm },
  handle: { width: 42, height: 4, borderRadius: 4, alignSelf: 'center', backgroundColor: colors.controlBorder, marginBottom: spacing.xs },
  title: { color: colors.ink, fontSize: fontSizes[17], fontWeight: '700', textAlign: 'right' },
  description: { color: colors.muted, fontSize: fontSizes[13], lineHeight: 20, textAlign: 'right' },
  option: { minHeight: 48, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.canvas },
  pressed: { opacity: 0.72 },
  optionText: { color: colors.ink, fontSize: fontSizes[14], fontWeight: '700' },
  dangerText: { color: colors.danger },
  cancel: { backgroundColor: colors.brandSoft, marginTop: spacing.xs },
  cancelText: { color: colors.brand, fontSize: fontSizes[14], fontWeight: '700' },
});
