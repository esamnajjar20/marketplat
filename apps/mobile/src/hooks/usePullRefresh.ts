import { useCallback, useState } from 'react';

/** حالة السحب للتحديث للشاشات التي تملك دالة تحميل واحدة (لا تُظهر شاشة تحميل كاملة أثناء التحديث). */
export function usePullRefresh(reload: () => Promise<unknown> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);
  return { refreshing, onRefresh };
}
