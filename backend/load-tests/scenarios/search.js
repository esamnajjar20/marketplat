/**
 * load-tests/scenarios/search.js
 *
 * Dedicated load test for GET /ads/search — deliberately separate from
 * browsing.js because full-text search hits a different code path
 * (the tsvector/@@ plainto_tsquery GIN index in ads.repository.ts,
 * not the plain B-tree [status, city] index the list endpoint uses)
 * and this project's own audit history specifically flagged a GIN
 * search-index expression mismatch as a real bug that was found and
 * fixed — meaning search performance under load is not something to
 * assume is fine just because GET /ads is fine.
 *
 * Uses a fixed, varied set of search terms (not one repeated term)
 * because tsquery performance and plan selection can differ
 * meaningfully by term frequency/selectivity — a common word matching
 * thousands of rows behaves differently than a rare one matching a
 * handful, and a load test using only one query string for its entire
 * duration would only characterize that one term's plan.
 *
 * Run:
 *   k6 run load-tests/scenarios/search.js
 *
 * Prerequisite: same as browsing.js — a non-trivial number of ACTIVE
 * ads in the target DB, ideally with real Arabic title/description
 * text (not placeholder Lorem Ipsum), since tsvector behavior over
 * Arabic content vs. English content can differ (see ads.repository.ts's
 * to_tsvector('simple', ...) — the 'simple' config does no
 * language-specific stemming for either language, but tokenization
 * still varies by script).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, DEFAULT_THRESHOLDS } from '../scripts/config.js';

// A mix of common Arabic marketplace terms likely to match many rows,
// a couple of more specific ones likely to match few, and one
// deliberately unlikely-to-match term — search's empty-result path
// (a WHERE clause that still has to run the tsquery, just returns
// zero rows) is worth measuring too, not just the "found results" path.
const SEARCH_TERMS = [
  'سيارة',
  'شقة',
  'موبايل',
  'iPhone',
  'أثاث',
  'دراجة كهربائية',
  'لن-يتطابق-هذا-البحث-مع-شيء-2099', // deliberately no matches
];

export const options = {
  scenarios: {
    search_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '1m', target: 60 },
        { duration: '2m', target: 60 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    // Full-text search over a GIN index is inherently pricier than a
    // simple indexed lookup — a looser threshold than browsing.js's
    // list/detail numbers is a deliberate, honest distinction, not an
    // oversight. Tighten this once a real baseline run gives you an
    // actual number to hold the line at.
    http_req_duration: ['p(95)<1200', 'p(99)<3000'],
  },
};

export default function () {
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const res = http.get(`${API}/ads/search?q=${encodeURIComponent(term)}&limit=20`, {
    tags: { name: 'GET /ads/search' },
  });

  check(res, {
    'search: status 200': (r) => r.status === 200,
    'search: response is an array (possibly empty)': (r) => Array.isArray(r.json('data')),
  });

  sleep(Math.random() * 2 + 1);
}
