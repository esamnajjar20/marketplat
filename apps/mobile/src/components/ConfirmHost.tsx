import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { subscribeToConfirmations, type ConfirmButton, type ConfirmRequest } from '@/lib/confirm';
import { radius, spacing, fontSizes, type ColorPalette, fontWeights } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

/** يعرض طلبات confirmAlert واحدًا تلو الآخر في نافذة تأكيد موحّدة. */
export function ConfirmHost() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => subscribeToConfirmations((request) => setQueue((items) => [...items, request])), []);

  const finish = useCallback((request: ConfirmRequest, button?: ConfirmButton) => {
    setQueue((items) => items.filter((item) => item.id !== request.id));
    button?.onPress?.();
  }, []);

  if (!current) return null;
  const cancelButton = current.buttons.find((button) => button.style === 'cancel');
  const actions = current.buttons.filter((button) => button !== cancelButton);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => finish(current, cancelButton)}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="إغلاق نافذة التأكيد"
          onPress={() => finish(current, cancelButton)}
        />
        <View style={styles.card} accessibilityRole="alert">
          <Text accessibilityRole="header" style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((button, index) => (
              <Pressable
                key={`${button.text}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={button.text}
                onPress={() => finish(current, button)}
                style={({ pressed }) => [
                  styles.button,
                  button.style === 'destructive' ? styles.buttonDanger : styles.buttonPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.buttonText, button.style === 'destructive' ? styles.buttonDangerText : styles.buttonPrimaryText]}>
                  {button.text}
                </Text>
              </Pressable>
            ))}
            {cancelButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={cancelButton.text}
                onPress={() => finish(current, cancelButton)}
                style={({ pressed }) => [styles.button, styles.buttonCancel, pressed && styles.pressed]}
              >
                <Text style={styles.buttonCancelText}>{cancelButton.text}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.modalBackdrop },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    card: { width: '100%', maxWidth: 420, padding: spacing.lg, gap: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    title: { color: colors.ink, fontSize: fontSizes[17], fontWeight: fontWeights.bold, textAlign: 'right' },
    message: { color: colors.muted, fontSize: fontSizes[14], lineHeight: 22, textAlign: 'right' },
    actions: { gap: spacing.sm, marginTop: spacing.xs },
    button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md },
    buttonPrimary: { backgroundColor: colors.brand },
    buttonDanger: { backgroundColor: colors.danger },
    buttonCancel: { backgroundColor: colors.brandSoft },
    buttonText: { fontSize: fontSizes[14], fontWeight: fontWeights.bold, textAlign: 'center' },
    buttonPrimaryText: { color: colors.onBrand },
    buttonDangerText: { color: colors.onDanger },
    buttonCancelText: { color: colors.brandOnSoft, fontSize: fontSizes[14], fontWeight: fontWeights.bold, textAlign: 'center' },
    pressed: { opacity: 0.72 },
  });
}
