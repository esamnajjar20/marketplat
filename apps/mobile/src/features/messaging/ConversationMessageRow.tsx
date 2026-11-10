import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppImage } from '@/components/AppImage';
import { AppIcon } from '@/components/Icons';
import type { ChatMessage } from '@/features/messaging/messaging.api';
import { CHAT_OUTBOX_MAX_ATTEMPTS } from '@/storage/outbox-manager';
import { fontSizes, colors, elevation, radius, spacing, typography, ux } from '@/theme/tokens';
import { isAllowedMediaUrl } from '@/lib/safe-media-url';
import { formatDate } from '@/lib/formatters';
import { showToast } from '@/lib/toast';
import * as WebBrowser from 'expo-web-browser';

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
  onPlayAudio: (url: string) => void;
  playingAudioUrl?: string | null;
  audioBuffering?: boolean;
};

function formatMessageTime(value: string): string {
  try {
    return formatDate(value, 'time');
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
  onPlayAudio,
  playingAudioUrl,
  audioBuffering = false,
}: Props) {
  const pending = message.id.startsWith('pending-');
  const permanentlyFailed = pending
    && message.outboxAttempts !== undefined
    && message.outboxAttempts >= CHAT_OUTBOX_MAX_ATTEMPTS;
  const safeImageUrl = !message.deletedAt && isAllowedMediaUrl(message.imageUrl)
    ? message.imageUrl
    : null;
  const body = message.deletedAt
    ? 'تم حذف هذه الرسالة'
    : message.body || (message.imageUrl
      ? 'صورة مرفقة'
      : message.audioUrl
        ? 'رسالة صوتية'
        : message.fileUrl
          ? 'ملف مرفق'
          : 'رسالة');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`رسالة من ${isMine ? 'أنت' : 'الطرف الآخر'}: ${body}`}
      onLongPress={() => onLongPress(message)}
      delayLongPress={350}
      style={[styles.bubble, isMine ? styles.mine : styles.theirs]}
    >
      {safeImageUrl ? (
        <AppImage uri={safeImageUrl} resizeMode="cover" style={styles.messageImage} accessibilityLabel="صورة مرفقة في المحادثة" />
      ) : null}

      {message.audioUrl && !message.deletedAt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تشغيل الرسالة الصوتية"
          style={styles.mediaAction}
          onPress={() => {
            if (!isAllowedMediaUrl(message.audioUrl)) {
              showToast('رابط مرفق غير موثوق', 'رفض التطبيق تشغيل هذا الرابط لأن مصدره غير مسموح.', 'warning');
              return;
            }
            onPlayAudio(message.audioUrl);
          }}
        >
          <View style={styles.mediaActionContent}><AppIcon name={playingAudioUrl === message.audioUrl ? 'pause' : 'play'} size={17} color={colors.brandOnSoft} /><Text style={styles.mediaActionText}>{audioBuffering && playingAudioUrl === message.audioUrl ? 'جارٍ تحميل الصوت…' : playingAudioUrl === message.audioUrl ? 'إيقاف / متابعة الصوت' : 'تشغيل الرسالة الصوتية'}</Text></View>
        </Pressable>
      ) : null}

      {message.fileUrl && !message.deletedAt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="فتح الملف المرفق"
          style={styles.mediaAction}
          onPress={() => {
            if (!isAllowedMediaUrl(message.fileUrl)) {
              showToast('رابط مرفق غير موثوق', 'رفض التطبيق فتح هذا الرابط لأن مصدره غير مسموح.', 'warning');
              return;
            }
            void WebBrowser.openBrowserAsync(message.fileUrl).catch(() => {
              showToast('تعذر فتح الملف', 'تحقق من الاتصال وحاول مجددًا.', 'error');
            });
          }}
        >
          <View style={styles.mediaActionContent}><AppIcon name="file" size={17} color={colors.brandOnSoft} /><Text style={styles.mediaActionText}>معاينة الملف داخل التطبيق</Text></View>
        </Pressable>
      ) : null}

      <Text style={[styles.messageText, isMine && styles.mineText]}>{body}</Text>
      <View style={styles.metadataRow}>
        <Text style={[styles.time, isMine && styles.mineTime]}>{formatMessageTime(message.createdAt)}</Text>
        {message.isPinned ? <AppIcon name="pin" size={12} color={isMine ? colors.white : colors.muted} /> : null}
        {message.isStarredByMe ? <AppIcon name="star" size={12} color={isMine ? colors.white : colors.muted} /> : null}
        {pending ? <Text style={[styles.time, isMine && styles.mineTime]}>{permanentlyFailed ? 'تعذّر الإرسال' : 'بانتظار المزامنة'}</Text> : null}
      </View>

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
    maxWidth: '82%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 18,
    gap: 6,
    marginVertical: 3,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomEndRadius: 6,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomStartRadius: 6,
    ...elevation.xs,
  },
  messageText: {
    ...typography.body,
    color: colors.ink,
    textAlign: 'right',
    lineHeight: 22,
  },
  mineText: {
    color: colors.white,
  },
  metadataRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  time: {
    fontSize: fontSizes[10],
    color: colors.muted,
  },
  mineTime: {
    color: 'rgba(255,255,255,0.78)',
  },
  messageImage: {
    width: 200,
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.borderSubtle ?? colors.border,
  },
  mediaAction: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  mediaActionContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  mediaActionText: {
    ...typography.captionStrong,
    color: colors.brandOnSoft,
    textAlign: 'right',
  },
  failedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  failedAction: {
    fontSize: fontSizes[12],
    fontWeight: '700',
    color: colors.brandSoft,
  },
  failedDelete: {
    fontSize: fontSizes[12],
    fontWeight: '700',
    color: colors.dangerSoft ?? colors.danger,
  },
});
