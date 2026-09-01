'use client';

/**
 * useAsyncAction — حالة تحميل محلية لأي عملية async خارج React Query.
 *
 * مناسب لـ: رفع ملف، عمليات متسلسلة، استدعاءات ليست useMutation.
 */

import { useCallback, useRef, useState } from 'react';

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const running = useRef(false);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      setIsPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        running.current = false;
        setIsPending(false);
      }
    },
    [action],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, isPending, error, reset };
}
