/**
 * تتبّع نشاط التمرير (سحب + زخم) على مستوى التطبيق.
 *
 * الهدف: عدم تشغيل أعمال ثانوية على JS thread (hydrate من SQLite، تحديثات حالة
 * من مزامنة خلفية، إلخ) أثناء التمرير، وتأجيلها إلى أن يهدأ التمرير.
 *
 * - القوائم تُبلّغ عن حالتها عبر `withScrollActivity` (يضيفها AppFlashList تلقائيًا).
 * - الأعمال المؤجلة تُشغَّل عبر `runWhenScrollIdle` وهي محدودة بزمن انتظار أقصى
 *   حتى لا تتجوّع (starvation) إن لم يصل حدث نهاية الزخم.
 */
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

type Task = {
  run: () => void;
  deadline: ReturnType<typeof setTimeout>;
};

const SETTLE_MS = 120;
const DEFAULT_MAX_WAIT_MS = 1_500;

let dragging = false;
let momentum = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
const queue = new Set<Task>();

export function isScrolling(): boolean {
  return dragging || momentum;
}

function drainIfIdle(): void {
  if (isScrolling() || queue.size === 0) return;
  if (settleTimer) clearTimeout(settleTimer);
  // مهلة قصيرة: حدث onMomentumScrollBegin يصل بعد onScrollEndDrag مباشرة.
  settleTimer = setTimeout(() => {
    settleTimer = null;
    if (isScrolling()) return;
    const pending = [...queue];
    queue.clear();
    for (const task of pending) {
      clearTimeout(task.deadline);
      try {
        task.run();
      } catch {
        /* مهمة مؤجلة فاشلة يجب ألا تكسر بقية المهام */
      }
    }
  }, SETTLE_MS);
}

export const scrollActivity = {
  dragStart(): void {
    dragging = true;
  },
  dragEnd(): void {
    dragging = false;
    drainIfIdle();
  },
  momentumStart(): void {
    momentum = true;
  },
  momentumEnd(): void {
    momentum = false;
    drainIfIdle();
  },
  /** للاختبارات فقط. */
  reset(): void {
    dragging = false;
    momentum = false;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = null;
    for (const task of queue) clearTimeout(task.deadline);
    queue.clear();
  },
};

/**
 * يشغّل `task` فورًا إن لم يكن هناك تمرير، وإلا يؤجّلها حتى يهدأ التمرير
 * (أو حتى `maxWaitMs` أيهما أسبق). تُعيد دالة إلغاء.
 */
export function runWhenScrollIdle(
  task: () => void,
  options: { maxWaitMs?: number } = {},
): () => void {
  if (!isScrolling()) {
    task();
    return () => undefined;
  }
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const entry: Task = {
    run: task,
    deadline: setTimeout(() => {
      queue.delete(entry);
      try {
        task();
      } catch {
        /* see above */
      }
    }, maxWaitMs),
  };
  queue.add(entry);
  return () => {
    clearTimeout(entry.deadline);
    queue.delete(entry);
  };
}

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
type ScrollHandler = ((event: ScrollEvent) => void) | undefined;

/** يدمج معالجات التمرير الخاصة بالمستدعي مع تتبّع النشاط. */
export function withScrollActivity(handlers: {
  onScrollBeginDrag?: ScrollHandler;
  onScrollEndDrag?: ScrollHandler;
  onMomentumScrollBegin?: ScrollHandler;
  onMomentumScrollEnd?: ScrollHandler;
}) {
  return {
    onScrollBeginDrag: (event: ScrollEvent) => {
      scrollActivity.dragStart();
      handlers.onScrollBeginDrag?.(event);
    },
    onScrollEndDrag: (event: ScrollEvent) => {
      scrollActivity.dragEnd();
      handlers.onScrollEndDrag?.(event);
    },
    onMomentumScrollBegin: (event: ScrollEvent) => {
      scrollActivity.momentumStart();
      handlers.onMomentumScrollBegin?.(event);
    },
    onMomentumScrollEnd: (event: ScrollEvent) => {
      scrollActivity.momentumEnd();
      handlers.onMomentumScrollEnd?.(event);
    },
  };
}
