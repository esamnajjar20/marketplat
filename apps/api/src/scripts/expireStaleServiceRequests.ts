/**
 * Closes service requests that sat in PENDING for more than
 * SERVICE_REQUEST_PENDING_TTL_DAYS (7) without a provider response, and
 * notifies the customer. Distinct from expireOpenRequests.ts, which handles
 * the open-requests marketplace (`requests` module), not `service-requests`.
 * Wire via cron: run-job.sh expire-service-requests
 */
import { serviceRequestsService } from '../modules/service-requests/service-requests.service';
import { logger } from '../shared/utils/logger';

async function main() {
  const count = await serviceRequestsService.expireStalePending();
  logger.info('expireStaleServiceRequests finished', { count });
  process.exit(0);
}

main().catch(err => {
  logger.error('expireStaleServiceRequests failed', { err });
  process.exit(1);
});
