import { useEffect, useRef } from 'react';
import { showToast } from '@/lib/toast';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { useIsOnline } from '@/lib/connectivity';
import { startOutboxSyncLifecycle, type OutboxLifecycleSnapshot } from './outbox-sync-lifecycle';
import { listOfflineCreates } from './entity-create-outbox';

/**
 * Adapter: connects the auth session and connectivity to the durable outbox
 * lifecycle. Mounted once beneath AuthProvider. Connectivity comes from
 * ConnectivityProvider (single NetInfo listener), not from this bridge.
 */
export function OutboxSyncLifecycleBridge() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const isOnline = useIsOnline();
  const latest = useRef<OutboxLifecycleSnapshot>({ isOnline: false, token: null, ownerId: null, csrfToken: null });
  const notifiedFailedCreates = useRef(new Set<string>());

  useEffect(() => {
    latest.current = { ...latest.current, token: accessToken, ownerId: user?.id ?? null, csrfToken, isOnline };
  }, [accessToken, csrfToken, user?.id, isOnline]);

  useEffect(() => {
    if (isRestoring || !isOnline) return;
    return startOutboxSyncLifecycle({
      getSnapshot: () => ({ ...latest.current }),
      subscribeConnectivity: () => () => undefined,
      onResult: () => {
        const ownerId = latest.current.ownerId;
        if (!ownerId) return;
        void listOfflineCreates(ownerId).then((items) => {
          const newlyFailed = items.filter((item) => item.state === 'failed' && !notifiedFailedCreates.current.has(item.id));
          if (newlyFailed.length === 0) return;
          newlyFailed.forEach((item) => notifiedFailedCreates.current.add(item.id));
          const count = newlyFailed.length;
          showToast(
            'تعذّر إكمال بعض الإضافات',
            count === 1
              ? 'توقفت إضافة محفوظة بسبب مشكلة في البيانات أو الصلاحيات. لم تُحذف؛ يمكنك مراجعتها وإعادة المحاولة أو حذفها.'
              : `توقفت ${count} إضافات محفوظة بسبب مشكلات في البيانات أو الصلاحيات. لم تُحذف؛ يمكنك مراجعتها وإعادة المحاولة أو حذفها.`,
            'warning',
            { label: 'عرض العمليات', onPress: () => router.push('/offline-queue') },
          );
        }).catch(() => {
          // The queue screen remains the source of truth if a local DB read fails.
        });
      },
    });
  }, [isRestoring, isOnline, accessToken, csrfToken, user?.id]);

  return null;
}
