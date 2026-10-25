'use client';

import { useEffect, useState } from 'react';

export interface VisualViewportMetrics {
  height: number;
  /** ارتفاع الكيبورد التقريبي بالبكسل (0 إن لم يُفتح) */
  keyboardOffset: number;
}

/**
 * ارتفاع المنطقة المرئية + إزاحة الكيبورد.
 * يُستخدم لتثبيت الـ Sheet فوق الكيبورد على الجوال.
 */
export function useVisualViewportHeight(): number | null {
  const m = useVisualViewportMetrics();
  return m?.height ?? null;
}

export function useVisualViewportMetrics(): VisualViewportMetrics | null {
  const [metrics, setMetrics] = useState<VisualViewportMetrics | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const v = window.visualViewport!;
      // الفرق بين ارتفاع النافذة والمنطقة المرئية ≈ الكيبورد
      const keyboardOffset = Math.max(0, window.innerHeight - v.height - v.offsetTop);
      setMetrics({ height: v.height, keyboardOffset });
    }

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return metrics;
}
