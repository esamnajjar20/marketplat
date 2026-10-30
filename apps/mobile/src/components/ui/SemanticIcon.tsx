import { AppIcon, type GlyphName } from '@/components/Icons';
import type { StyleProp, TextStyle } from 'react-native';
/**
 * Stable semantic icon API. Kept as a thin compatibility adapter until
 * lucide-react-native/react-native-svg can be added with a regenerated pnpm lockfile.
 * New screens should use semantic names rather than literal Unicode glyphs.
 */
export function SemanticIcon({ name, size = 20, color, style }: { name: GlyphName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <AppIcon name={name} size={size} color={color} style={style} />;
}
