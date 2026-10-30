import { Text, type TextStyle, type StyleProp } from 'react-native';
import { colors } from '@/theme/tokens';

/**
 * مجموعة رموز نصية موحّدة للتطبيق (بدون تبعية مكتبة أيقونات).
 * استخدمها بدل إدخال أحرف عشوائية في الشاشات.
 */
export const glyphs = {
  home: '⌂',
  search: '⌕',
  add: '+',
  messages: '▤',
  account: '♙',
  back: '‹',
  forward: '›',
  close: '×',
  favorite: '♡',
  favoriteActive: '♥',
  share: '↗',
  store: '▣',
  service: '✦',
  product: '◇',
  notification: '◔',
  check: '✓',
  warning: '!',
  menu: '☰',
  settings: '⚙',
  help: '؟',
  ads: '▣',
  orders: '▤',
  logout: '↪',
  login: '→',
} as const;

export type GlyphName = keyof typeof glyphs;

export function AppIcon({
  name,
  size = 20,
  color = colors.ink,
  style,
}: {
  name: GlyphName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[{ fontSize: size, color, fontWeight: '700', lineHeight: size + 4 }, style]}>
      {glyphs[name]}
    </Text>
  );
}
