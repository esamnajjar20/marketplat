import { AppText as Text } from '@/components/ui/AppText';
import { type TextStyle, type StyleProp } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontWeights } from '@/theme/tokens';

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
  back: '›',
  forward: '‹',
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
  refresh: '↻',
  privacy: '◈',
  info: 'ⓘ',
  image: '▧',
  audio: '♫',
  microphone: '♩',
  file: '▤',
  play: '▶',
  pause: 'Ⅱ',
  pin: '⌖',
  star: '☆',
  ads: '▣',
  orders: '▤',
  logout: '↪',
  login: '→',
} as const;

export type GlyphName = keyof typeof glyphs;

export function AppIcon({
  name,
  size = 20,
  color: colorOverride,
  style,
}: {
  name: GlyphName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useAppTheme();
  const color = colorOverride ?? colors.ink;
  return (
    <Text maxFontSizeMultiplier={1.3} style={[{ fontSize: size, color, fontWeight: fontWeights.bold, lineHeight: size + 4 }, style]}>
      {glyphs[name]}
    </Text>
  );
}
