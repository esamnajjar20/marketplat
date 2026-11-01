import { Text as NativeText, type TextProps } from 'react-native';

/** Shared text primitive: respects system font scaling. Constrained controls may pass a multiplier cap. */
export function AppText({ allowFontScaling = true, ...props }: TextProps) {
  return <NativeText {...props} allowFontScaling={allowFontScaling} />;
}
