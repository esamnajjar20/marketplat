'use client';

/**
 * Reports Core Web Vitals (LCP, INP, CLS, FCP, TTFB) via Next.js helper.
 * Sends to the existing analytics beacon as metadata — never blocks UI.
 */

import { useReportWebVitals } from 'next/web-vitals';
import { track } from '@/lib/analytics';

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Lightweight: only sample-friendly fields; avoid flooding backend.
    try {
      track('PAGE_VIEW', {
        webVital: metric.name,
        value: Math.round(metric.value),
        rating: metric.rating,
        id: metric.id,
      });
    } catch {
      // analytics must never throw into the app
    }
  });

  return null;
}
