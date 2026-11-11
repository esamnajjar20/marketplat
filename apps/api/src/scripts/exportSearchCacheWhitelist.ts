import { prisma } from '../config/prisma';
import {
  isSearchCacheWhitelistCandidate,
  normalizeSearchCacheTerm,
} from '../shared/search/searchCacheWhitelist';

const BUILT_IN_TERMS = new Set([
  'سيارة', 'هاتف', 'لابتوب', 'شقة', 'غرفة', 'كرسي',
  'ثلاجة', 'غسالة', 'تكييف', 'سباك', 'كهربائي',
]);
const WORKER_TERM_LIMIT = 500;
const AVAILABLE_CUSTOM_TERMS = WORKER_TERM_LIMIT - BUILT_IN_TERMS.size;

function positiveIntegerArg(name: string, fallback: number, max: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

async function main(): Promise<void> {
  const days = positiveIntegerArg('days', 30, 365);
  const minCount = positiveIntegerArg('min-count', 5, 1_000_000);

  const rows = await prisma.$queryRaw<Array<{ term: string; searchCount: bigint }>>`
    SELECT
      LOWER(REGEXP_REPLACE(BTRIM("metadata"->>'q'), '[[:space:]]+', ' ', 'g')) AS term,
      COUNT(*)::bigint AS "searchCount"
    FROM "analytics_events"
    WHERE "event" = 'SEARCH'::"AnalyticsEventType"
      AND "createdAt" >= NOW() - (${days}::int * INTERVAL '1 day')
      AND jsonb_typeof("metadata") = 'object'
      AND NULLIF(BTRIM("metadata"->>'q'), '') IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) >= ${minCount}
    ORDER BY "searchCount" DESC, term ASC
    LIMIT 5000
  `;

  const counts = new Map<string, number>();
  for (const row of rows) {
    const term = normalizeSearchCacheTerm(String(row.term ?? ''));
    if (!isSearchCacheWhitelistCandidate(term) || BUILT_IN_TERMS.has(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + Number(row.searchCount));
  }
  const selected = [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term, 'ar'))
    .slice(0, AVAILABLE_CUSTOM_TERMS);

  console.log(`Search window: ${days} days; minimum frequency: ${minCount}`);
  console.log(`Eligible reviewed candidates: ${selected.length}/${AVAILABLE_CUSTOM_TERMS} custom terms`);
  console.log('Counts are aggregated; user IDs, sessions and source records are not exported.');
  console.log('Review each phrase before adding it: common names or sensitive phrases may still appear.');
  console.log('\nTerm | Searches');
  for (const item of selected) console.log(`${item.term} | ${item.count}`);
  console.log('\nCandidate Worker variable (copy only after manual review):');
  console.log(`SEARCH_CACHE_WHITELIST = "${selected.map(item => item.term).join('|')}"`);
}

main()
  .catch(error => {
    console.error('Failed to export search cache candidates:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
