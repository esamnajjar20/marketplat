/**
 * Marks OPEN requests past expiresAt as EXPIRED.
 * Wire via cron / package.json script, e.g.:
 *   "report:expire-open-requests": "ts-node-dev --transpile-only --exit-child src/scripts/expireOpenRequests.ts"
 */
import { requestsService } from '../modules/requests/requests.service';
import { logger } from '../shared/utils/logger';

async function main() {
  const count = await requestsService.expireDueRequests();
  logger.info('expireOpenRequests finished', { count });
  process.exit(0);
}

main().catch(err => {
  logger.error('expireOpenRequests failed', { err });
  process.exit(1);
});
