import { prisma } from '../../config/prisma';
import { ServiceRequestBroadcast, ServiceQuote } from '@prisma/client';
import {
  serviceBroadcastsRepository,
  serviceQuotesRepository,
  BroadcastWithRelations,
  BroadcastListItem,
  QuoteWithProvider,
} from './service-broadcasts.repository';
import { CreateBroadcastInput, GetOpenBroadcastsQuery, GetMyBroadcastsQuery, SubmitQuoteInput } from './service-broadcasts.validation';
import { sellersRepository } from '../sellers/sellers.repository';
import { serviceProvidersRepository } from '../service-providers/service-providers.repository';
import { conversationsService } from '../conversations/conversations.service';
import { notificationEvents } from '../notifications';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { logger } from '../../shared/utils/logger';

/** Resolves the caller's own ServiceProviderDetails.id from their
 * userId — same userId -> sellerProfile -> provider chain
 * service-providers.service.ts's getMyServiceProviderAnalytics already
 * uses. Throws (not null) since every caller of this needs a provider
 * profile to proceed at all — there's no valid "provider action with
 * no provider profile" path in this module. */
const requireOwnProviderId = async (userId: string): Promise<string> => {
  const sellerProfile = await sellersRepository.findByUserId(userId);
  if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');
  const provider = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
  if (!provider) throw new NotFoundError('Service provider profile not found', 'SERVICE_PROVIDER_NOT_FOUND');
  return provider.id;
};


/** Writes disabled after Open Requests (/requests) became the primary marketplace. */
const assertLegacyWritesEnabled = (): void => {
  // Set LEGACY_SERVICE_BROADCASTS_WRITES=1 only for emergency rollback.
  if (process.env.LEGACY_SERVICE_BROADCASTS_WRITES === '1') return;
  throw new BadRequestError(
    'سوق الطلبات انتقل إلى /requests. استخدم POST /api/v1/requests و /api/v1/requests/:id/offers.',
    'LEGACY_SERVICE_BROADCASTS_DEPRECATED',
  );
};

export const serviceBroadcastsService = {
  create: (customerId: string, input: CreateBroadcastInput): Promise<ServiceRequestBroadcast> => {
    assertLegacyWritesEnabled();
    return serviceBroadcastsRepository.create(customerId, input);
  },

  getOpenFeed: async (query: GetOpenBroadcastsQuery): Promise<PaginatedResult<BroadcastListItem>> => {
    const { broadcasts, total } = await serviceBroadcastsRepository.findOpenFeed(query);
    return { items: broadcasts, meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20) };
  },

  getMyBroadcasts: async (
    customerId: string,
    query: GetMyBroadcastsQuery
  ): Promise<PaginatedResult<BroadcastListItem>> => {
    const { broadcasts, total } = await serviceBroadcastsRepository.findManyByCustomerId(customerId, query);
    return { items: broadcasts, meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20) };
  },

  /**
   * Detail view. Unlike ServiceRequest (strictly customer/provider
   * private — see conversations.service.ts's assertParty pattern), a
   * broadcast's whole point is to be visible to providers deciding
   * whether to quote on it, so this has no ownership check — any
   * authenticated user may view any broadcast. Quotes are always
   * included (see broadcastWithRelations) since price transparency
   * between competing providers is intentional here, the same "open
   * marketplace" reasoning the original feature spec calls for
   * (customer compares multiple visible offers), not a private
   * negotiation the way a single ServiceRequest's quotedPrice is.
   */
  getById: async (id: string): Promise<BroadcastWithRelations> => {
    const broadcast = await serviceBroadcastsRepository.findById(id);
    if (!broadcast) throw new NotFoundError('Service broadcast not found', 'SERVICE_BROADCAST_NOT_FOUND');
    return broadcast;
  },

  cancel: async (userId: string, id: string): Promise<ServiceRequestBroadcast> => {
    assertLegacyWritesEnabled();
    const broadcast = await serviceBroadcastsRepository.findById(id);
    if (!broadcast) throw new NotFoundError('Service broadcast not found', 'SERVICE_BROADCAST_NOT_FOUND');
    if (broadcast.customerId !== userId) {
      throw new ForbiddenError('Only the customer who posted this can cancel it.', 'NOT_YOUR_BROADCAST');
    }
    if (broadcast.status !== 'OPEN') {
      throw new ConflictError('Only an open broadcast can be cancelled.', 'BROADCAST_NOT_OPEN');
    }
    return serviceBroadcastsRepository.cancel(id);
  },

  /**
   * A provider submits (or, on a second call, revises) their offer.
   * Revision reuses the same row (see repository's @@unique on
   * [broadcastId, providerId]) rather than erroring on a duplicate —
   * a provider adjusting their price after seeing a competitor's is
   * exactly the behavior an open marketplace should allow, not block.
   */
  submitQuote: async (userId: string, broadcastId: string, input: SubmitQuoteInput): Promise<ServiceQuote> => {
    assertLegacyWritesEnabled();
    const broadcast = await serviceBroadcastsRepository.findById(broadcastId);
    if (!broadcast) throw new NotFoundError('Service broadcast not found', 'SERVICE_BROADCAST_NOT_FOUND');
    if (broadcast.status !== 'OPEN') {
      throw new ConflictError('This broadcast is no longer accepting quotes.', 'BROADCAST_NOT_OPEN');
    }

    const providerId = await requireOwnProviderId(userId);

    if (broadcast.customerId === userId) {
      throw new BadRequestError('You cannot quote on your own request.', 'CANNOT_QUOTE_OWN_BROADCAST');
    }

    const existing = await serviceQuotesRepository.findByBroadcastAndProvider(broadcastId, providerId);
    const quote = existing
      ? await serviceQuotesRepository.update(existing.id, input)
      : await serviceQuotesRepository.create(broadcastId, providerId, input);

    // Fire-and-forget, same convention as every other notificationEvents
    // caller in this codebase (e.g. conversationsService.sendMessage) —
    // a failed notification write must never fail the quote submission
    // itself, which has already succeeded above.
    if (!existing) {
      const provider = await serviceProvidersRepository.findPublicById(providerId);
      if (provider) {
        notificationEvents
          .onNewServiceQuote(broadcast.customerId, broadcastId, quote.id, provider.sellerProfile.displayName, broadcast.title)
          .catch((err) => logger.error('Failed to create NEW_SERVICE_QUOTE notification', { err, broadcastId }));
      }
    }

    return quote;
  },

  withdrawQuote: async (userId: string, quoteId: string): Promise<ServiceQuote> => {
    assertLegacyWritesEnabled();
    const quote = await serviceQuotesRepository.findById(quoteId);
    if (!quote) throw new NotFoundError('Quote not found', 'QUOTE_NOT_FOUND');
    if (quote.provider.sellerProfile.userId !== userId) {
      throw new ForbiddenError('You can only withdraw your own quote.', 'NOT_YOUR_QUOTE');
    }
    if (quote.status !== 'PENDING') {
      throw new ConflictError('Only a pending quote can be withdrawn.', 'QUOTE_NOT_PENDING');
    }
    return serviceQuotesRepository.withdraw(quoteId);
  },

  /**
   * The customer picks a winner. Runs the accept + auto-decline-others
   * as one transaction (same atomic-conditional-update philosophy as
   * service-requests.service.ts's respondToRequest — the WHERE clause
   * inside markAccepted guards against the broadcast having already
   * moved off OPEN between the read above and this write), then starts
   * a real conversation between the two parties so they can coordinate
   * scheduling/payment — see schema.prisma's own doc comment on
   * ServiceRequestBroadcast for why acceptance hands off to chat rather
   * than this model growing its own booking machinery.
   */
  acceptQuote: async (userId: string, broadcastId: string, quoteId: string): Promise<ServiceRequestBroadcast> => {
    assertLegacyWritesEnabled();
    const broadcast = await serviceBroadcastsRepository.findById(broadcastId);
    if (!broadcast) throw new NotFoundError('Service broadcast not found', 'SERVICE_BROADCAST_NOT_FOUND');
    if (broadcast.customerId !== userId) {
      throw new ForbiddenError('Only the customer who posted this can accept a quote.', 'NOT_YOUR_BROADCAST');
    }
    if (broadcast.status !== 'OPEN') {
      throw new ConflictError('This broadcast has already been decided.', 'BROADCAST_NOT_OPEN');
    }

    const quote = await serviceQuotesRepository.findById(quoteId);
    if (!quote || quote.broadcastId !== broadcastId) {
      throw new NotFoundError('Quote not found on this broadcast.', 'QUOTE_NOT_FOUND');
    }
    if (quote.status !== 'PENDING') {
      throw new ConflictError('This quote is no longer available.', 'QUOTE_NOT_PENDING');
    }

    const result = await prisma.$transaction(async (tx) => {
      const acceptResult = await serviceBroadcastsRepository.markAccepted(tx, broadcastId, quoteId);
      if (acceptResult.count === 0) {
        // Lost the race — another accept already landed between the
        // reads above and this transaction (same "count===0 means
        // someone beat us to it" handling as respondToRequest's own
        // ConflictError branch).
        throw new ConflictError('This broadcast has already been decided.', 'BROADCAST_NOT_OPEN');
      }
      await serviceQuotesRepository.accept(tx, quoteId);
      await serviceQuotesRepository.declineOthers(tx, broadcastId, quoteId);
      return tx.serviceRequestBroadcast.findUniqueOrThrow({ where: { id: broadcastId } });
    });

    const providerUserId = quote.provider.sellerProfile.userId;

    notificationEvents
      .onServiceQuoteAccepted(providerUserId, broadcastId, quoteId, broadcast.title)
      .catch((err) => logger.error('Failed to create SERVICE_QUOTE_ACCEPTED notification', { err, broadcastId }));

    // Best-effort — a conversation failing to start must never undo an
    // already-accepted quote. The customer/provider can still fall back
    // to a phone number on either profile; PublicProfileHeader's own
    // "مراسلة" button is also still available as a manual path if this
    // silently fails for some reason.
    conversationsService
      .startFromUser(userId, providerUserId)
      .catch((err) => logger.error('Failed to start conversation after quote acceptance', { err, broadcastId }));

    return result;
  },

  getMyQuotes: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<PaginatedResult<QuoteWithProvider>> => {
    const providerId = await requireOwnProviderId(userId);
    const { quotes, total } = await serviceQuotesRepository.findManyByProviderId(providerId, query);
    return { items: quotes, meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20) };
  },
};
