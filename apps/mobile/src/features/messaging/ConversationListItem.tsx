import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationItem } from '@/features/messaging/messaging.api';
import { colors, radius, spacing, typography } from '@/theme/tokens';

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
  if (message.imageUrl) return '📷 صورة';
  if (message.audioUrl) return '🎙️ رسالة صوتية';
  if (message.fileUrl) return '📎 ملف مرفق';
  return 'رسالة جديدة';
}

function ConversationListItemView({ item, currentUserId, onPress, onTogglePin, onToggleArchive, busy = false }: ConversationListItemProps) {
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
        {(onTogglePin || onToggleArchive) ? (
          <View style={styles.actions}>
            {onTogglePin ? <Pressable accessibilityRole="button" accessibilityLabel={item.mySettings?.pinnedAt ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'} disabled={busy} onPress={() => onTogglePin(item)} style={styles.action}><Text style={styles.actionText}>{item.mySettings?.pinnedAt ? 'إلغاء التثبيت' : 'تثبيت'}</Text></Pressable> : null}
            {onToggleArchive ? <Pressable accessibilityRole="button" accessibilityLabel={item.mySettings?.archivedAt ? 'إلغاء أرشفة المحادثة' : 'أرشفة المحادثة'} disabled={busy} onPress={() => onToggleArchive(item)} style={styles.action}><Text style={styles.actionText}>{item.mySettings?.archivedAt ? 'إلغاء الأرشفة' : 'أرشفة'}</Text></Pressable> : null}
          </View>
        ) : null}
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
  actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  action: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.controlBorder },
  actionText: { color: colors.brand, fontSize: 12, fontWeight: '800' },
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
