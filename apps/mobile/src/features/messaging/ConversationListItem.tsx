import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationItem } from '@/features/messaging/messaging.api';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type ConversationListItemProps = {
  item: ConversationItem;
  currentUserId?: string;
  onPress: (conversationId: string) => void;
};

function getConversationPreview(conversation: ConversationItem): string {
  const message = conversation.lastMessage;
  if (!message) return conversation.ad?.title ? `بخصوص: ${conversation.ad.title}` : 'ابدأ المحادثة بإرسال رسالة.';
  if (message.deletedAt) return 'تم حذف هذه الرسالة';
  if (message.body?.trim()) return message.body.trim();
  if (message.imageUrl) return '📷 صورة';
  if (message.audioUrl) return '🎙️ رسالة صوتية';
  if (message.fileUrl) return '📎 ملف مرفق';
  return 'رسالة جديدة';
}

function ConversationListItemView({ item, currentUserId, onPress }: ConversationListItemProps) {
  const other = item.buyerId === currentUserId ? item.seller : item.buyer;
  const unread = item.unreadCount ?? 0;
  const name = other?.name || 'مستخدم';
  const accessibleName = `${name}${unread > 0 ? `، ${unread} رسالة غير مقروءة` : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleName}
      accessibilityHint="فتح المحادثة"
      onPress={() => onPress(item.id)}
      style={[styles.card, unread > 0 && styles.unread]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(other?.name || '?').slice(0, 1)}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.name} numberOfLines={1}>
            {name}{item.mySettings?.pinnedAt ? ' 📌' : ''}
          </Text>
          {unread > 0 ? (
            <View style={styles.badge} accessibilityLabel={`${unread} رسائل غير مقروءة`}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {getConversationPreview(item)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row-reverse',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { borderColor: colors.borderStrong, backgroundColor: colors.brandSoft },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brand, fontWeight: '900', fontSize: 16 },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...typography.bodyStrong, color: colors.ink, flex: 1, textAlign: 'right' },
  preview: { ...typography.caption, color: colors.muted, textAlign: 'right', lineHeight: 18 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '900' },
});

export default memo(ConversationListItemView);
