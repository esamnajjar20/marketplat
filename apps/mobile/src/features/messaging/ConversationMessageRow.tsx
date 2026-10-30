import { memo } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '@/features/messaging/messaging.api';
import { CHAT_OUTBOX_MAX_ATTEMPTS } from '@/storage/outbox-manager';
import { colors, radius, spacing } from '@/theme/tokens';

export type ConversationScreenMessage = ChatMessage & {
  outboxAttempts?: number;
  outboxLastError?: string | null;
};

type Props = {
  message: ConversationScreenMessage;
  isMine: boolean;
  onLongPress: (message: ConversationScreenMessage) => void;
  onRetry: (message: ConversationScreenMessage) => void;
  onDiscard: (message: ConversationScreenMessage) => void;
};

function formatMessageTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  isMine,
  onLongPress,
  onRetry,
  onDiscard,
}: Props) {
  const pending = message.id.startsWith('pending-');
  const permanentlyFailed = pending
    && message.outboxAttempts !== undefined
    && message.outboxAttempts >= CHAT_OUTBOX_MAX_ATTEMPTS;
  const body = message.deletedAt
    ? 'تم حذف هذه الرسالة'
    : message.body || (message.imageUrl
      ? '📷 صورة مرفقة'
      : message.audioUrl
        ? '🎙️ رسالة صوتية'
        : message.fileUrl
          ? '📎 ملف مرفق'
          : 'رسالة');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`رسالة من ${isMine ? 'أنت' : 'الطرف الآخر'}: ${body}`}
      onLongPress={() => onLongPress(message)}
      delayLongPress={350}
      style={[styles.bubble, isMine ? styles.mine : styles.theirs]}
    >
      {message.imageUrl && !message.deletedAt ? (
        <Image source={{ uri: message.imageUrl }} resizeMode="cover" style={styles.messageImage} />
      ) : null}

      {message.audioUrl && !message.deletedAt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تشغيل الرسالة الصوتية"
          style={styles.mediaAction}
          onPress={() => void Linking.openURL(message.audioUrl!).catch(() =>
            Alert.alert('تعذر فتح الصوت', 'تحقق من الاتصال وحاول مجددًا.'),
          )}
        >
          <Text style={styles.mediaActionText}>▶ تشغيل الرسالة الصوتية</Text>
        </Pressable>
      ) : null}

      {message.fileUrl && !message.deletedAt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="فتح الملف المرفق"
          style={styles.mediaAction}
          onPress={() => void Linking.openURL(message.fileUrl!).catch(() =>
            Alert.alert('تعذر فتح الملف', 'تحقق من الاتصال وحاول مجددًا.'),
          )}
        >
          <Text style={styles.mediaActionText}>📎 فتح الملف المرفق</Text>
        </Pressable>
      ) : null}

      <Text style={[styles.messageText, isMine && styles.mineText]}>{body}</Text>
      <Text style={[styles.time, isMine && styles.mineTime]}>
        {formatMessageTime(message.createdAt)}
        {message.isPinned ? ' · 📌' : ''}
        {message.isStarredByMe ? ' · ⭐' : ''}
        {pending ? (permanentlyFailed ? ' · تعذّر الإرسال' : ' · بانتظار المزامنة') : ''}
      </Text>

      {permanentlyFailed ? (
        <View style={styles.failedActions}>
          <Pressable accessibilityRole="button" onPress={() => onRetry(message)}>
            <Text style={styles.failedAction}>إعادة المحاولة</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onDiscard(message)}>
            <Text style={styles.failedDelete}>حذف</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
});

export default ConversationMessageRow;

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: 4,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomRightRadius: 4,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
  },
  mineText: { color: colors.white },
  messageImage: {
    width: 220,
    height: 180,
    borderRadius: radius.sm,
    marginBottom: 4,
    backgroundColor: colors.canvas,
  },
  mediaAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    alignSelf: 'flex-start',
  },
  mediaActionText: { fontSize: 12, fontWeight: '800', color: colors.brand },
  time: { fontSize: 10, color: colors.muted, textAlign: 'left' },
  mineTime: { color: colors.brandSoft },
  failedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  failedAction: { fontSize: 11, fontWeight: '900', color: colors.brand },
  failedDelete: { fontSize: 11, fontWeight: '900', color: colors.danger },
});
