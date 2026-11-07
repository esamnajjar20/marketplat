'use client';

/**
 * Reports Core Web Vitals (LCP, INP, CLS, FCP, TTFB) via Next.js helper.
 * Sends to the existing analytics beacon as metadata — never blocks UI.
 */

import { useReportWebVitals } from 'next/web-vitals';
import { track } from '@/lib/analytics';

// Vitals are statistical: report only the three that drive decisions (LCP/INP/CLS)
// and only for ~25% of page loads. Each one is an extra analytics event (and a
// PAGE_VIEW row), so reporting all five for every visitor multiplied POSTs to
// /analytics/events for no added accuracy. Decided once per page load.
const REPORTED_VITALS = new Set(['LCP', 'INP', 'CLS']);
const SAMPLED = typeof Math !== 'undefined' && Math.random() < 0.25;

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (!SAMPLED || !REPORTED_VITALS.has(metric.name)) return;
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
