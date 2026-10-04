import { prisma } from '../../config/prisma';
import { Prisma, ServiceRequest, ServiceRequestStatus } from '@prisma/client';
import {
  serviceRequestsRepository,
  ServiceRequestWithListing,
} from './service-requests.repository';
import { CreateServiceRequestInput, GetServiceRequestsQuery } from './service-requests.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { serviceListingsRepository } from '../service-listings/service-listings.repository';
import { sellersRepository } from '../sellers/sellers.repository';
import { serviceProvidersRepository } from '../service-providers/service-providers.repository';
import { activityService, activityTemplates } from '../activity';
import { notificationEvents } from '../notifications/notifications.service';
import { logger } from '../../shared/utils/logger';
import { blockedUsersService } from '../blocked-users';

// services-design.md §5-§7: single source of truth for legal status
// transitions. Adding a future status (e.g. DISPUTED) is a one-line
// change here, not a hunt through scattered if-statements.
const ALLOWED_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  // FIX SR-EXPIRY-TRANSITIONS (audit H4): EXPIRED is system-only — no path
  // leads into or out of it via the API. Listed so the Record stays exhaustive.
  EXPIRED: [],
};

// services-design.md §7 table: who is allowed to *initiate* each
// transition — narrower than "is this transition legal at all"
// (ALLOWED_TRANSITIONS). E.g. PENDING->CANCELLED is a legal transition,
// but only the customer may trigger it (a provider withdraws via
// REJECTED, not CANCELLED).
type Actor = 'customer' | 'provider' | 'either';
const TRANSITION_ACTOR: Record<string, Actor> = {
  'PENDING->ACCEPTED': 'provider',
  'PENDING->REJECTED': 'provider',
  'PENDING->CANCELLED': 'customer',
  'ACCEPTED->IN_PROGRESS': 'provider',
  'ACCEPTED->CANCELLED': 'either',
  'IN_PROGRESS->CANCELLED': 'either',
  'IN_PROGRESS->COMPLETED': 'provider',
};

// Terminal statuses only — see recomputeProviderStats below. A request
// can only ever reach one of these once (ALLOWED_TRANSITIONS has no
// outgoing edges from any of the three), so this recompute fires at
// most once per request.
// FIX SR-EXPIRY-TERMINAL (audit H4): EXPIRED is terminal like the rest.
const TERMINAL_STATUSES: ServiceRequestStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

// FIX (dead-stats): completedRequestsCount/fulfillmentRate
// (ServiceProviderDetails) were rendered on MyServiceProviderCard from
// day one but nothing in this codebase ever wrote to them — every
// provider showed "0 طلب مكتمل" / "—" forever regardless of real
// activity. Recomputed from ServiceRequest itself (source of truth)
// rather than incremented in place, so a rare double-fire or past gap
// self-heals instead of drifting further out of sync over time.
// fulfillmentRate definition (not a prior product decision — see
// badges.constants.ts's own note on the same kind of judgment call):
// completed / (completed + cancelled + rejected), i.e. of every
// request that reached a final outcome, what share the provider
// actually fulfilled. null (not 0) when there's no terminal history
// yet, so the UI's `fulfillmentRate ? ... : '—'` check keeps showing
// "—" for a brand-new provider instead of a misleading 0%.
const recomputeProviderStats = async (
  tx: Prisma.TransactionClient,
  providerId: string
): Promise<void> => {
  const { completed, cancelledOrRejected } =
    await serviceRequestsRepository.countTerminalStatsByProviderId(providerId);
  const totalTerminal = completed + cancelledOrRejected;
  await serviceProvidersRepository.updateStats(tx, providerId, {
    completedRequestsCount: completed,
    fulfillmentRate: totalTerminal > 0 ? Math.round((completed / totalTerminal) * 10000) / 100 : null,
  });
};

// FIX SR-EXPIRY (audit H4): a PENDING request nobody answers within this
// window is closed automatically (see expireStalePending). 7 days: long
// enough for a part-time provider to see it over a weekend/holiday, short
// enough that their inbox doesn't fill with dead requests.
export const SERVICE_REQUEST_PENDING_TTL_DAYS = 7;
const EXPIRY_BATCH_SIZE = 200;
const EXPIRY_MAX_BATCHES = 50; // hard ceiling per run (10k rows)

export const serviceRequestsService = {
  createRequest: async (
    customerId: string,
    input: CreateServiceRequestInput,
    offlineOperationId?: string | null,
  ): Promise<ServiceRequest> => {
    // FIX OFFLINE-IDEMPOTENCY-01
    if (offlineOperationId) {
      const existing = await prisma.serviceRequest.findUnique({ where: { offlineOperationId } });
      if (existing) {
        if (existing.customerId !== customerId) {
          throw new ConflictError('Offline operation id already used', 'OFFLINE_OP_ID_CONFLICT');
        }
        return existing;
      }
    }

    const listing = await serviceListingsRepository.findById(input.listingId);
    if (!listing || listing.status !== 'ACTIVE') {
      throw new BadRequestError('This service listing is not available for requests.');
    }

    // SECURITY FIX (self-dealing): a provider must not be able to open a
    // request against their own listing — doing so lets them drive the
    // whole PENDING->ACCEPTED->IN_PROGRESS->COMPLETED chain themselves
    // (all provider-only transitions, see TRANSITION_ACTOR below) and
    // then leave themselves a review via service-reviews.service.ts,
    // which only checks request.customerId === raterId — inflating
    // SellerProfile.averageRating/trustScore/totalSales from a fake
    // transaction. sellersService.createRating already guards the
    // equivalent case on the legacy ad-seller rating path
    // (`profile.userId === raterId`); this closes the same gap for the
    // services system, at the earliest point (request creation) so it
    // also blocks fake completedRequestsCount/responseRate inflation,
    // not just fake reviews.
    const provider = await serviceProvidersRepository.findPublicById(listing.providerId);
    if (provider && provider.sellerProfile.userId === customerId) {
      throw new ForbiddenError('You cannot request your own service listing.', 'CANNOT_REQUEST_OWN_LISTING');
    }

    if (provider?.availabilityStatus === 'UNAVAILABLE') {
      throw new BadRequestError('This service provider is currently unavailable for new requests.', 'PROVIDER_UNAVAILABLE');
    }

    // SECURITY FIX (blocked-user coverage gap): blockedUsersService's
    // isBlockedEitherDirection was previously only ever called from
    // conversations.service.ts (starting/sending a message) — a user
    // blocked by a provider (or who had blocked the provider) could
    // still open a service request against them, bypassing the entire
    // point of blocking. Checked in either direction, same as
    // conversations.service.ts's own use of this helper: a block should
    // stop new requests regardless of who blocked whom.
    if (provider && (await blockedUsersService.isBlockedEitherDirection(customerId, provider.sellerProfile.userId))) {
      throw new ForbiddenError('You cannot request this service.', 'USER_BLOCKED');
    }

    // FIX SR-DUPLICATE (audit H4): the only protection against repeat
    // requests was a 20/hr rate limit. One open request per (customer,
    // listing) — finished/rejected/cancelled ones don't count, so the
    // customer can ask again later. (Not DB-enforced: a partial unique
    // index would need a migration; two truly simultaneous submits can
    // still slip through, which is acceptable for a spam guard.)
    const openRequest = await serviceRequestsRepository.findOpenByCustomerAndListing(
      customerId,
      input.listingId
    );
    if (openRequest) {
      throw new ConflictError(
        'You already have an open request for this service.',
        'DUPLICATE_SERVICE_REQUEST'
      );
    }

    let request: ServiceRequest;
    try {
      request = await prisma.$transaction(async tx =>
        serviceRequestsRepository.create(tx, customerId, input.listingId, {
          details: input.details,
          attachedImages: input.attachedImages ?? [],
          offlineOperationId: offlineOperationId ?? null,
        })
      );
    } catch (err: unknown) {
      if (
        offlineOperationId &&
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        const existing = await prisma.serviceRequest.findUnique({ where: { offlineOperationId } });
        if (existing && existing.customerId === customerId) return existing;
      }
      throw err;
    }

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment. Logged for `customerId` (the requester), not the
    // provider — a request is the customer's own action.
    activityService.record({
      userId: customerId,
      ...activityTemplates.serviceRequestCreated(request.id, listing.title),
    });

    // Fire-and-forget: tell the provider a request arrived. `provider`
    // can be null only if the listing's provider row vanished mid-flight.
    if (provider) {
      notificationEvents
        .onServiceRequestCreated(provider.sellerProfile.userId, request.id, listing.title, customerId)
        .catch((err) =>
          logger.error('Failed to create SERVICE_REQUEST_NEW notification', { err, requestId: request.id })
        );
    }

    return request;
  },

  getRequestById: async (userId: string, id: string): Promise<ServiceRequestWithListing> => {
    const request = await serviceRequestsRepository.findById(id);
    if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');

    const isCustomer = request.customerId === userId;
    const isProvider = request.listing.provider.sellerProfile.userId === userId;
    if (!isCustomer && !isProvider) {
      throw new ForbiddenError('You do not have permission to view this request.', 'NOT_YOUR_SERVICE_REQUEST');
    }
    return request;
  },

  getMyRequestsAsCustomer: async (
    customerId: string,
    query: GetServiceRequestsQuery
  ): Promise<PaginatedResult<ServiceRequestWithListing>> => {
    const { requests, total } = await serviceRequestsRepository.findManyByCustomerId(
      customerId,
      query
    );
    return {
      items: requests,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  getMyRequestsAsProvider: async (
    userId: string,
    query: GetServiceRequestsQuery
  ): Promise<PaginatedResult<ServiceRequestWithListing>> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');

    const provider = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!provider) throw new NotFoundError('Service provider profile not found', 'SERVICE_PROVIDER_NOT_FOUND');

    const { requests, total } = await serviceRequestsRepository.findManyByProviderId(
      provider.id,
      query
    );
    return {
      items: requests,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  // services-design.md §7: the one function every status change flows
  // through — validates the transition is legal, validates the caller
  // is the right actor for it, then does the atomic conditional update.
  respondToRequest: async (
    userId: string,
    requestId: string,
    action: ServiceRequestStatus,
    extra?: { quotedPrice?: number; agreedPrice?: number }
  ): Promise<ServiceRequest> => {
    const request = await serviceRequestsRepository.findById(requestId);
    if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');

    const isCustomer = request.customerId === userId;
    const isProvider = request.listing.provider.sellerProfile.userId === userId;
    if (!isCustomer && !isProvider) {
      throw new ForbiddenError('You do not have permission to act on this request.', 'NOT_YOUR_SERVICE_REQUEST_ACTION');
    }

    if (!ALLOWED_TRANSITIONS[request.status].includes(action)) {
      throw new ConflictError(`Cannot transition from ${request.status} to ${action}`);
    }

    const actorRequired = TRANSITION_ACTOR[`${request.status}->${action}`];
    const callerRole: Actor = isProvider ? 'provider' : 'customer';
    if (actorRequired && actorRequired !== 'either' && actorRequired !== callerRole) {
      throw new ForbiddenError(
        `Only the ${actorRequired === 'provider' ? 'service provider' : 'customer'} can perform this action.`
      );
    }

    // FIX SR-PRICE-REQUIRED: ACCEPTED without a quotedPrice left the
    // customer with "accepted" but no price to agree to, and COMPLETED
    // without an agreedPrice produced a request whose agreedPrice stayed
    // null — which sumRevenueByProviderId silently skips (it sums
    // COMPLETED.agreedPrice), so a real completed job could vanish from
    // the provider's own revenue total. Both fields were declared
    // optional in respondToServiceRequestSchema and the repository
    // spread them conditionally, so nothing enforced the dependency at
    // any layer. Checked here (the one place every transition flows
    // through, after the actor check) rather than at the schema level,
    // because the requirement depends on request.status — a fact the
    // schema cannot see.
    if (action === 'ACCEPTED' && extra?.quotedPrice === undefined) {
      throw new BadRequestError(
        'quotedPrice is required when accepting a request.',
        'QUOTED_PRICE_REQUIRED',
      );
    }
    if (action === 'COMPLETED' && extra?.agreedPrice === undefined) {
      throw new BadRequestError(
        'agreedPrice is required when completing a request.',
        'AGREED_PRICE_REQUIRED',
      );
    }

    const updatedRequest = await prisma.$transaction(async tx => {
      const result = await serviceRequestsRepository.transitionStatus(
        tx,
        requestId,
        request.status,
        action,
        extra
      );
      if (result.count === 0) {
        // Status changed between the read above and this write (rare
        // race) — same "authoritative check at write time" philosophy
        // as createAd.
        throw new ConflictError('Request status has changed — please refresh and try again', 'SERVICE_REQUEST_CHANGED');
      }
      const updated = await tx.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });

      // FIX (dead-stats): only fires on the three terminal statuses —
      // see TERMINAL_STATUSES/recomputeProviderStats above. Runs in
      // the same transaction as the status write itself so the two
      // can never land inconsistently (request says COMPLETED but
      // the provider's counters didn't move, or vice versa).
      if (TERMINAL_STATUSES.includes(action)) {
        await recomputeProviderStats(tx, request.listing.providerId);
      }

      // Gap #10: fire-and-forget, see activityService.record()'s own
      // doc comment — safe to call from inside the transaction
      // callback since record() never awaits its own DB write and
      // therefore never holds the transaction open waiting on it.
      // Logged for `userId` (whichever party — customer or provider —
      // performed this specific transition, per the actor check
      // above), not always the customer, since a provider accepting/
      // completing a request is that provider's own action.
      activityService.record({
        userId,
        ...activityTemplates.serviceRequestStatusChanged(
          requestId,
          request.listing.title,
          request.status,
          action
        ),
      });

      return updated;
    });

    // Fire-and-forget AFTER commit: tell the OTHER party. A notification
    // must never be sent for a transition that was rolled back, and a
    // failed notification must never fail a transition that succeeded.
    const recipientRole: Actor = isProvider ? 'customer' : 'provider';
    const recipientUserId = isProvider
      ? request.customerId
      : request.listing.provider.sellerProfile.userId;
    notificationEvents
      .onServiceRequestStatusChanged(
        recipientUserId,
        recipientRole,
        requestId,
        request.listing.title,
        action
      )
      .catch((err) =>
        logger.error('Failed to create SERVICE_REQUEST_UPDATE notification', { err, requestId })
      );

    return updatedRequest;
  },

  // FIX SR-EXPIRY (audit H4). Run from cron (scripts/expireStaleServiceRequests.ts).
  // Moves PENDING requests older than the TTL to CANCELLED with
  // respondedAt left NULL (the "system closed it" marker — no schema
  // change needed) and tells the customer. Safe to re-run and to overlap
  // with user actions: the UPDATE is conditional on status = PENDING.
  expireStalePending: async (
    now: Date = new Date(),
    ttlDays: number = SERVICE_REQUEST_PENDING_TTL_DAYS
  ): Promise<number> => {
    const cutoff = new Date(now.getTime() - ttlDays * 24 * 60 * 60 * 1000);
    let expired = 0;

    for (let batch = 0; batch < EXPIRY_MAX_BATCHES; batch += 1) {
      const stale = await serviceRequestsRepository.findStalePending(cutoff, EXPIRY_BATCH_SIZE);
      if (stale.length === 0) break;

      let progressed = 0;
      for (const row of stale) {
        const { count } = await serviceRequestsRepository.expirePending(row.id, cutoff);
        if (count === 0) continue; // answered in the meantime
        progressed += 1;
        expired += 1;
        // FIX SR-EXPIRY-TTL-PARAM (audit H4): pass ttlDays so the body
        // cannot lie if the TTL constant changes.
        notificationEvents
          .onServiceRequestExpired(row.customerId, row.id, row.listing.title, ttlDays)
          .catch((err) =>
            logger.error('Failed to create expiry notification', { err, requestId: row.id })
          );
      }
      // Nothing changed in a full batch → the same rows would come back.
      if (progressed === 0 || stale.length < EXPIRY_BATCH_SIZE) break;
    }

    return expired;
  },
};
