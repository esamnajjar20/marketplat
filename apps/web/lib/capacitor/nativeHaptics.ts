/**
 * Native haptics — filters + messaging.
 * Install: npm i @capacitor/haptics && npx cap sync
 */

import { isNativePlatform } from './platform';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export async function triggerHaptic(style: HapticStyle = 'light'): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!(await isNativePlatform())) return;

  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');

    switch (style) {
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case 'heavy':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        break;
      default:
        await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {
    /* plugin missing */
  }
}

export function hapticSheetOpen(): Promise<void> {
  return triggerHaptic('light');
}

export function hapticFilterApply(): Promise<void> {
  return triggerHaptic('medium');
}

export function hapticQuickFilter(): Promise<void> {
  return triggerHaptic('success');
}

/** After a message is sent successfully (or queued offline). */
export function hapticMessageSent(): Promise<void> {
  return triggerHaptic('light');
}

/** Send failed (optional). */
export function hapticMessageError(): Promise<void> {
  return triggerHaptic('error');
}
