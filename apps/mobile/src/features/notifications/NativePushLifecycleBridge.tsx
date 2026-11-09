import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useOnlineResync } from '@/lib/useOnlineResync';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { syncGrantedAndroidPush, registerAndroidFcmToken, isAndroidPushEnabled } from './native-push';
import { logger } from '@/lib/logger';
import { getConfiguredWebUrl } from '@/lib/web-links';
import { toAppHref } from '@/lib/typed-navigation';

// اكتشاف بيئة Expo Go بالطرق المتاحة
const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
const isExpoGoAndroid = Platform.OS === 'android' && isExpoGo;

if (!isExpoGoAndroid) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    // تجاهل
  }
}

function safeNotificationPath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2_048) return '/notifications';
  try {
    const webBase = getConfiguredWebUrl('/');
    const parsed = new URL(value, webBase);
    const expectedOrigin = new URL(webBase).origin;
    if (parsed.origin !== expectedOrigin) return '/notifications';
    const path = `${parsed.pathname}${parsed.search}`;
    if (
      !/^\/(?:notifications|messages|orders|appointments|ads|products|services|stores)(?:\/[A-Za-z0-9_-]+)?(?:\?[A-Za-z0-9_=&%-]*)?$/.test(path)
      || path.includes('..')
      || path.includes('\\')
    ) return '/notifications';
    return path;
  } catch {
    return '/notifications';
  }
}

export function NativePushLifecycleBridge() {
  const { user, accessToken, csrfToken } = useAuth();
  const userId = user?.id;
  const lastResponseId = useRef<string | null>(null);
  const syncInFlight = useRef(false);
  
  const synchronize = useCallback(() => {
    if (isExpoGoAndroid || Platform.OS !== 'android' || !userId || !accessToken || syncInFlight.current) return;
    syncInFlight.current = true;
    void syncGrantedAndroidPush(accessToken, csrfToken)
      .catch((error) => {
        logger.warn('native-push', 'Granted Android push token could not be synchronized', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => { syncInFlight.current = false; });
  }, [userId, accessToken, csrfToken]);
  
  useOnlineResync(synchronize);

  useEffect(() => {
    if (isExpoGoAndroid) return;
    if (Platform.OS !== 'android' || !userId || !accessToken) return;
    
    let active = true;
    synchronize();
    
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') synchronize();
    });

    let tokenSubscription: any;
    try {
      tokenSubscription = Notifications.addPushTokenListener((token) => {
        if (!active || !accessToken || syncInFlight.current) return;
        const value = typeof token.data === 'string' ? token.data : '';
        if (!value) return;
        syncInFlight.current = true;
        void isAndroidPushEnabled()
          .then((enabled) => {
            if (!active || !enabled) return;
            return registerAndroidFcmToken(accessToken, csrfToken, value);
          })
          .catch((error) => {
            logger.warn('native-push', 'Rotated FCM token registration failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => { syncInFlight.current = false; });
      });
    } catch (e) {
      // اصطياد خطأ Expo Go بهدوء
    }

    const openResponse = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      const identifier = response.notification.request.identifier;
      if (identifier && lastResponseId.current === identifier) return;
      lastResponseId.current = identifier || null;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      router.push(toAppHref(safeNotificationPath(data?.url)));
    };

    let responseSubscription: any;
    try {
      responseSubscription = Notifications.addNotificationResponseReceivedListener(openResponse);
      void Notifications.getLastNotificationResponseAsync().then(openResponse).catch(() => undefined);
    } catch (e) {
      // اصطياد خطأ Expo Go بهدوء
    }

    return () => {
      active = false;
      appStateSubscription.remove();
      if (tokenSubscription) tokenSubscription.remove();
      if (responseSubscription) responseSubscription.remove();
    };
  }, [userId, accessToken, csrfToken, synchronize]);

  return null;
}
