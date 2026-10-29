import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * يعيد استدعاء onReconnect عند الانتقال الحقيقي من offline إلى online فقط.
 * لا يعيد الاشتراك عند تغيّر دوال التحميل (يستخدم refs).
 */
export function useOnlineResync(onReconnect: () => void) {
  const connectivityRef = useRef<boolean | null>(null);
  const cbRef = useRef(onReconnect);
  useEffect(() => {
    cbRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      connectivityRef.current = online;
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const previous = connectivityRef.current;
      connectivityRef.current = online;
      if (previous === false && online) {
        cbRef.current();
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);
}
