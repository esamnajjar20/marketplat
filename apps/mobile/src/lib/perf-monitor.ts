/**
 * مراقب JS FPS لأوقات التطوير فقط (لا يعمل في الإنتاج).
 * يقيس معدل إطارات JS thread كل ثانية ويحذّر عند الهبوط تحت العتبة.
 * هذا ليس بديلًا عن Flashlight/Perfetto لقياس UI thread والذاكرة على جهاز حقيقي.
 */
import { logger } from '@/lib/logger';
import { isScrolling } from '@/lib/scrollActivity';

const WINDOW_MS = 1_000;
const WARN_BELOW_FPS = 45;

export function startJsFpsMonitor(): () => void {
  if (!__DEV__) return () => undefined;
  let frames = 0;
  let windowStart = Date.now();
  let raf = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    frames += 1;
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      const fps = Math.round((frames * 1_000) / (now - windowStart));
      if (fps < WARN_BELOW_FPS) {
        logger.warn('perf', `JS FPS ${fps}${isScrolling() ? ' (during scroll)' : ''}`);
      }
      frames = 0;
      windowStart = now;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
