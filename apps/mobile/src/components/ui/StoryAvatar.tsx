import { View } from 'react-native';
import { Avatar } from './Avatar';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, sizes, spacing } from '@/theme/tokens';

/**
 * صورة صاحب القصة داخل حلقة ملوّنة: الحلقة خضراء للقصص غير المشاهدة ورمادية للمشاهدة.
 * مصدر واحد لشريط القصص في الرئيسية وشاشة القصص.
 */
export function StoryAvatar({
  uri,
  name,
  unseen,
}: {
  uri?: string | null;
  name?: string | null;
  unseen?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        width: sizes.avatarLg,
        height: sizes.avatarLg,
        borderRadius: radius.pill,
        padding: spacing.xs,
        borderWidth: 2,
        borderColor: unseen ? colors.brand : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Avatar uri={uri} name={name} size="md" />
    </View>
  );
}
