/**
 * نمط موحّد لتحميل مورد غير متزامن: loading / error / refresh / data.
 * يغطي التكرار الشائع في الشاشات دون فرض TanStack Query.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { logger } from '@/lib/logger';

export type AsyncResourceState<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: (opts?: { soft?: boolean }) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
};

type Options<T> = {
  /** مفتاح لإعادة التحميل عند تغيّره (مثل userId أو فلاتر) */
  key?: string;
  /** لا يحمّل تلقائيًا عند التركيب */
  manual?: boolean;
  mapError?: (error: unknown) => string;
  tag?: string;
  initialData?: T | null;
  /**
   * قراءة اختيارية من الكاش المحلي قبل الشبكة (للتحميل الكامل فقط، لا للتحديث الناعم).
   * إن وُجدت نسخة تُعرض فورًا ثم تُستبدل بنتيجة الشبكة؛ وإن فشلت الشبكة بعد عرضها تبقى النسخة
   * ظاهرة دون خطأ. فشل القراءة نفسها لا يمنع طلب الشبكة.
   */
  readCached?: () => Promise<T | null>;
};

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'AbortError');
}

function defaultMapError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'تعذر تحميل البيانات.';
}

export function useAsyncResource<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  options: Options<T> = {},
): AsyncResourceState<T> {
  const {
    key = '',
    manual = false,
    mapError = defaultMapError,
    tag = 'resource',
    initialData = null,
    readCached,
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(!manual);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  const mapErrorRef = useRef(mapError);
  const tagRef = useRef(tag);
  const readCachedRef = useRef(readCached);
  const controllerRef = useRef<AbortController | null>(null);
  fetcherRef.current = fetcher;
  mapErrorRef.current = mapError;
  tagRef.current = tag;
  readCachedRef.current = readCached;

  const reload = useCallback(
    async (opts?: { soft?: boolean }) => {
      const requestId = ++seq.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const soft = opts?.soft === true;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      let shownCached = false;
      try {
        if (!soft && readCachedRef.current) {
          try {
            const cached = await readCachedRef.current();
            if (cached != null && requestId === seq.current && !controller.signal.aborted) {
              shownCached = true;
              setData(cached);
              setLoading(false);
            }
          } catch {
            // فشل الكاش المحلي لا يجب أن يمنع القراءة من الشبكة.
          }
        }
        if (requestId !== seq.current || controller.signal.aborted) return;
        const result = await fetcherRef.current(controller.signal);
        if (requestId !== seq.current || controller.signal.aborted) return;
        setData(result);
      } catch (e) {
        if (requestId !== seq.current || controller.signal.aborted || isAbortError(e)) return;
        const message = mapErrorRef.current(e);
        logger.warn(tagRef.current, 'load failed', { message });
        // نسخة الكاش المعروضة تبقى بدل استبدالها بشاشة خطأ.
        if (shownCached) return;
        setError(message);
      } finally {
        if (requestId === seq.current) {
          setLoading(false);
          setRefreshing(false);
          if (controllerRef.current === controller) controllerRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!manual) void reload();
    return () => {
      // Ignore any completion after unmount/key change and release the network request.
      seq.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
    // key يُعيد التشغيل عند تغيّر الاعتماديات الخارجية
  }, [key, manual, reload]);

  return { data, loading, refreshing, error, reload, setData };
}
