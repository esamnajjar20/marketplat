import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ConversationItem } from '@/features/messaging/messaging.api';
import { AppImage } from '@/components/AppImage';
import { isAllowedMediaUrl } from '@/lib/safe-media-url';
import { fontSizes, elevation, radius, spacing, typography, ux, type ColorPalette, fontWeights } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

type ConversationListItemProps = {
  item: ConversationItem;
  currentUserId?: string;
  onPress: (conversationId: string) => void;
  onTogglePin?: (item: ConversationItem) => void;
  onToggleArchive?: (item: ConversationItem) => void;
  busy?: boolean;
};

function getConversationPreview(conversation: ConversationItem): string {
  const message = conversation.lastMessage;
  if (!message) return conversation.ad?.title ? `بخصوص: ${conversation.ad.title}` : 'ابدأ المحادثة بإرسال رسالة.';
  if (message.deletedAt) return 'تم حذف هذه الرسالة';
  if (message.body?.trim()) return message.body.trim();
  if (message.imageUrl) return 'صورة مرفقة';
  if (message.audioUrl) return 'رسالة صوتية';
  if (message.fileUrl) return 'ملف مرفق';
  return 'رسالة جديدة';
}

function ConversationListItemView({
  item,
  currentUserId,
  onPress,
  onTogglePin,
  onToggleArchive,
  busy = false,
}: ConversationListItemProps) {
  const other = item.buyerId === currentUserId ? item.seller : item.buyer;
  const unread = item.unreadCount ?? 0;
  const name = other?.name || 'مستخدم';
  const accessibleName = `${name}${unread > 0 ? `، ${unread} رسالة غير مقروءة` : ''}`;
  const avatarUrl = isAllowedMediaUrl(other?.avatarUrl) ? other.avatarUrl : null;
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [avatarUrl]);
  const pinned = Boolean(item.mySettings?.pinnedAt);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleName}
      accessibilityHint="فتح المحادثة"
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [
        styles.card,
        unread > 0 && styles.unread,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.avatar}>
        {avatarUrl && !avatarFailed ? (
          <AppImage
            uri={avatarUrl}
            style={styles.avatarImage}
            accessibilityLabel={`صورة ${name}`}
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <Text style={styles.avatarText}>{(other?.name || '?').slice(0, 1)}</Text>
        )}
        {unread > 0 ? <View style={styles.avatarDot} /> : null}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
            {name}
            {pinned ? ' · مثبتة' : ''}
          </Text>
          {unread > 0 ? (
            <View style={styles.badge} accessibilityLabel={`${unread} رسائل غير مقروءة`}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={2}>
          {getConversationPreview(item)}
        </Text>
        {item.ad?.title ? (
          <Text style={styles.adHint} numberOfLines={1}>
            {item.ad.title}
          </Text>
        ) : null}
        {onTogglePin || onToggleArchive ? (
          <View style={styles.actions}>
            {onTogglePin ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
                disabled={busy}
                onPress={() => onTogglePin(item)}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionText}>{pinned ? 'إلغاء التثبيت' : 'تثبيت'}</Text>
              </Pressable>
            ) : null}
            {onToggleArchive ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  item.mySettings?.archivedAt ? 'إلغاء أرشفة المحادثة' : 'أرشفة المحادثة'
                }
                disabled={busy}
                onPress={() => onToggleArchive(item)}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionText}>
                  {item.mySettings?.archivedAt ? 'إلغاء الأرشفة' : 'أرشفة'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card ?? radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.sm,
  },
  unread: {
    borderColor: colors.brandSoftActive ?? colors.borderStrong,
    backgroundColor: colors.brandSoft,
  },
  pressed: { opacity: ux.pressedOpacity },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.brandOnSoft,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes[18],
  },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  avatarDot: {
    position: 'absolute',
    top: 2,
    start: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  cardBody: { flex: 1, gap: 3, justifyContent: 'center' },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    ...typography.bodyStrong,
    color: colors.ink,
    textAlign: 'right',
  },
  nameUnread: { fontWeight: fontWeights.bold },
  preview: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    lineHeight: 18,
  },
  previewUnread: {
    color: colors.inkSecondary ?? colors.ink,
    fontWeight: fontWeights.medium,
  },
  adHint: {
    ...typography.overline,
    color: colors.brand,
    textAlign: 'right',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.onBrand,
    fontSize: fontSizes[11],
    fontWeight: fontWeights.bold,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 6,
  },
  action: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  actionText: {
    color: colors.brand,
    fontSize: fontSizes[12],
    fontWeight: fontWeights.semibold,
  },
  });
}

export default memo(ConversationListItemView);
