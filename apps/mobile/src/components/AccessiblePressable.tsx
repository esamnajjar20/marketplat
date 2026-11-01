import { forwardRef, type ComponentProps, type ComponentRef } from 'react';
import { Pressable as NativePressable } from 'react-native';

export type AccessiblePressableProps = ComponentProps<typeof NativePressable>;

export const AccessiblePressable = forwardRef<ComponentRef<typeof NativePressable>, AccessiblePressableProps>(
  function AccessiblePressable({ accessibilityRole, onPress, onLongPress, ...props }, ref) {
    const role = accessibilityRole ?? (onPress || onLongPress ? 'button' : undefined);
    return <NativePressable ref={ref} {...props} onPress={onPress} onLongPress={onLongPress} accessibilityRole={role} />;
  },
);

AccessiblePressable.displayName = 'AccessiblePressable';
